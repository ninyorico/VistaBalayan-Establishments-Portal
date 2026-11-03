import { GoogleGenerativeAI } from '@google/generative-ai';
import { getBearerToken, getSupabaseAdmin, readBody, sendJson } from './_utils/emailjs.js';

const MODEL_NAMES = Array.from(new Set([
  process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
]));
const requestWindows = new Map();
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 5;
const PERIOD_TYPES = ['weekly', 'monthly', 'quarterly', 'yearly'];
const INSIGHT_TYPE = 'administrative_report';

const clean = (value, maxLength) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
const normalizeSection = (value, fallback) => clean(value, 1200) || fallback;
const allowRequest = (key) => {
  const now = Date.now();
  const current = requestWindows.get(key);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    requestWindows.set(key, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= MAX_REQUESTS_PER_WINDOW) return false;
  current.count += 1;
  return true;
};
const isRetryable = (error) => /(?:404|429|500|502|503|unavailable|high demand|not found)/i.test(String(error?.message || error));

const generateWithFallback = async (apiKey, prompt) => {
  let lastError = null;
  for (const modelName of MODEL_NAMES) {
    try {
      const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      return { text: await result.response.text(), modelName };
    } catch (error) {
      lastError = error;
      const providerStatus = error?.status || error?.statusCode || error?.response?.status || 'unknown';
      console.error('Administrative AI model attempt failed', { model: modelName, providerStatus, retryable: isRetryable(error) });
      if (!isRetryable(error)) throw error;
    }
  }
  const error = new Error('AI models are temporarily unavailable');
  error.statusCode = 503;
  error.cause = lastError;
  throw error;
};

const parseJsonObject = (text) => {
  const match = String(text).match(/\{[\s\S]*\}/);
  if (!match) throw new Error('AI returned an invalid report format');
  return JSON.parse(match[0]);
};

const isDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));

const getIsoWeekKey = (reportDate) => {
  const date = new Date(`${reportDate}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const year = date.getUTCFullYear();
  const firstDay = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil((((date.getTime() - firstDay.getTime()) / 86400000) + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
};

const getSubmissionKey = (row) => {
  const establishment = String(row?.establishment_id || 'unknown');
  const date = String(row?.report_date || 'unknown').slice(0, 10);
  const group = clean(row?.guest_group_name || row?.guest_name, 160);
  const batch = clean(row?.created_at, 80);
  return `${establishment}|${date}|${group || batch || String(row?.id || 'record')}`;
};

const aggregateRows = (visitorRows, accommodationRows = []) => {
  const groups = Object.fromEntries(PERIOD_TYPES.map((periodType) => [periodType, new Map()]));
  const addRow = (row, kind) => {
    if (!row?.report_date) return;
    const date = String(row.report_date).slice(0, 10);
    const year = date.slice(0, 4);
    const monthNumber = Number(date.slice(5, 7));
    const keys = { weekly: getIsoWeekKey(date), monthly: date.slice(0, 7), quarterly: `${year}-Q${Math.floor((monthNumber - 1) / 3) + 1}`, yearly: year };
    const submissionKey = kind === 'visitor' ? getSubmissionKey(row) : null;
    PERIOD_TYPES.forEach((periodType) => {
      const key = keys[periodType];
      const current = groups[periodType].get(key) || { visitorTotal: 0, guestCheckInTotal: 0, visitorRecordCount: 0, accommodationRecordCount: 0, submissions: new Set(), establishments: new Set() };
      if (kind === 'visitor') {
        current.visitorTotal += Number(row.total_guests || 0);
        current.visitorRecordCount += 1;
        current.submissions.add(submissionKey);
      } else {
        current.guestCheckInTotal += Number(row.total_check_ins || 0);
        current.accommodationRecordCount += 1;
      }
      if (row.establishment_id) current.establishments.add(String(row.establishment_id));
      groups[periodType].set(key, current);
    });
  };
  visitorRows.forEach((row) => addRow(row, 'visitor'));
  accommodationRows.forEach((row) => addRow(row, 'accommodation'));
  return Object.fromEntries(PERIOD_TYPES.map((periodType) => [
    periodType,
    [...groups[periodType].entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, value]) => ({
      period,
      visitorTotal: value.visitorTotal,
      guestCheckInTotal: value.guestCheckInTotal,
      visitorRecordCount: value.visitorRecordCount,
      accommodationRecordCount: value.accommodationRecordCount,
      submissionCount: value.submissions.size,
      establishmentCount: value.establishments.size,
    })),
  ]));
};

const loadSourceData = async (supabaseAdmin, startDate, endDate) => {
  const fetchRows = async (table, select) => {
    const rows = [];
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabaseAdmin.from(table).select(select).eq('status', 'submitted').gte('report_date', startDate).lte('report_date', endDate).order('report_date', { ascending: true }).range(offset, offset + pageSize - 1);
      if (error) throw new Error(`Unable to load submitted ${table.replace('_', ' ')} data from the system`);
      rows.push(...(data || []));
      if (!data || data.length < pageSize) break;
    }
    return rows;
  };
  const [visitorRows, accommodationRows] = await Promise.all([
    fetchRows('visitor_reports', 'id,report_date,total_guests,establishment_id,guest_group_name,guest_name,created_at'),
    fetchRows('accommodation_reports', 'id,report_date,total_check_ins,establishment_id,created_at'),
  ]);
  const aggregates = aggregateRows(visitorRows, accommodationRows);
  return {
    dateRange: { startDate, endDate },
    visitorRecordCount: visitorRows.length,
    accommodationRecordCount: accommodationRows.length,
    submissionCount: new Set(visitorRows.map(getSubmissionKey)).size,
    visitorTotal: visitorRows.reduce((sum, row) => sum + Number(row.total_guests || 0), 0),
    guestCheckInTotal: accommodationRows.reduce((sum, row) => sum + Number(row.total_check_ins || 0), 0),
    establishmentCount: new Set([...visitorRows, ...accommodationRows].map((row) => row.establishment_id).filter(Boolean).map(String)).size,
    aggregates,
  };
};

const buildDeterministicReport = (periodLabel, source) => {
  const summarize = (periodType) => {
    const rows = source.aggregates[periodType] || [];
    const visitorTotal = rows.reduce((sum, row) => sum + row.visitorTotal, 0);
    const guestCheckInTotal = rows.reduce((sum, row) => sum + row.guestCheckInTotal, 0);
    const visitorRecords = rows.reduce((sum, row) => sum + row.visitorRecordCount, 0);
    const accommodationRecords = rows.reduce((sum, row) => sum + row.accommodationRecordCount, 0);
    return `${periodType[0].toUpperCase()}${periodType.slice(1)} source data contains ${rows.length} period rows, ${visitorTotal.toLocaleString()} visitors, ${guestCheckInTotal.toLocaleString()} guest check-ins, ${visitorRecords.toLocaleString()} visitor records, and ${accommodationRecords.toLocaleString()} accommodation records.`;
  };
  return {
    overview: `${periodLabel} covers ${source.dateRange.startDate} to ${source.dateRange.endDate}. The system verified ${source.visitorTotal.toLocaleString()} visitors from ${source.visitorRecordCount.toLocaleString()} visitor records and ${source.guestCheckInTotal.toLocaleString()} guest check-ins from ${source.accommodationRecordCount.toLocaleString()} accommodation records across ${source.establishmentCount.toLocaleString()} establishments.`,
    weekly: summarize('weekly'),
    monthly: summarize('monthly'),
    quarterly: summarize('quarterly'),
    yearly: summarize('yearly'),
    followUp: 'Use the displayed source rows for official totals. Submission groups are reconstructed from existing visitor-row fields because legacy visitor rows do not contain a shared submission ID.',
  };
};

export { aggregateRows };

const readCachedReport = async (supabaseAdmin, periodKey) => {
  const { data, error } = await supabaseAdmin
    .from('ai_insights_cache')
    .select('id, data, period, generated_at')
    .eq('insight_type', INSIGHT_TYPE)
    .eq('period', periodKey)
    .eq('is_active', true)
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const report = data?.data?.report;
  if (!report || typeof report !== 'object' || !report.source || !Number.isFinite(Number(report.source.visitorRecordCount)) || !Number.isFinite(Number(report.source.accommodationRecordCount)) || !Number.isFinite(Number(report.source.guestCheckInTotal)) || !Number.isFinite(Number(report.source.submissionCount))) return null;
  return { report, generatedAt: data.generated_at, periodKey: data.period };
};

const saveCachedReport = async (supabaseAdmin, { periodKey, periodLabel, report, modelName, source }) => {
  const payload = {
    report,
    periodLabel,
    modelName,
    source,
  };
  const existing = await readCachedReport(supabaseAdmin, periodKey);
  if (existing) {
    const { data: existingRow, error: existingError } = await supabaseAdmin
      .from('ai_insights_cache')
      .select('id')
      .eq('insight_type', INSIGHT_TYPE)
      .eq('period', periodKey)
      .eq('is_active', true)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;
    const { error } = await supabaseAdmin
      .from('ai_insights_cache')
      .update({ data: payload, generated_at: new Date().toISOString(), is_active: true, expires_at: null })
      .eq('id', existingRow.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabaseAdmin.from('ai_insights_cache').insert({
    insight_type: INSIGHT_TYPE,
    data: payload,
    period: periodKey,
    generated_at: new Date().toISOString(),
    expires_at: null,
    is_active: true,
  });
  if (error) throw error;
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });

  try {
    const token = getBearerToken(req);
    if (!token) return sendJson(res, 401, { error: 'Authentication required' });
    const supabaseAdmin = getSupabaseAdmin();
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user?.id) return sendJson(res, 401, { error: 'Invalid officer session' });
    const { data: profile, error: profileError } = await supabaseAdmin.from('profiles').select('role,status').eq('id', userData.user.id).maybeSingle();
    if (profileError) return sendJson(res, 403, { error: 'Unable to verify officer access' });
    if (profile?.role !== 'municipal_officer' || profile?.status !== 'active') return sendJson(res, 403, { error: 'Only active municipal officers can access administrative reports' });

    const body = await readBody(req);
    const periodKey = clean(body?.periodKey, 120);
    if (!periodKey) return sendJson(res, 400, { error: 'A report period is required.' });

    const cached = await readCachedReport(supabaseAdmin, periodKey);
    if (body?.action === 'get') return sendJson(res, 200, { cached });
    if (cached && body?.forceRegenerate !== true) return sendJson(res, 200, { report: cached.report, cached: true, generatedAt: cached.generatedAt });

    if (!allowRequest(userData.user.id)) return sendJson(res, 429, { error: 'Too many AI requests. Please try again later.' });

    const periodLabel = clean(body?.periodLabel, 160) || 'the selected period';
    const startDate = clean(body?.startDate, 10);
    const endDate = clean(body?.endDate, 10);
    if (!isDate(startDate) || !isDate(endDate) || startDate > endDate) return sendJson(res, 400, { error: 'A valid report date range is required.' });
    const source = await loadSourceData(supabaseAdmin, startDate, endDate);
    if (source.visitorRecordCount === 0 && source.accommodationRecordCount === 0) return sendJson(res, 400, { error: 'No submitted visitor or accommodation data is available for this period.' });
    const report = { ...buildDeterministicReport(periodLabel, source), source };
    await saveCachedReport(supabaseAdmin, { periodKey, periodLabel, report, modelName: 'deterministic-source-report', source });
    return sendJson(res, 200, { report, model: 'deterministic-source-report', cached: false, saved: true, generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Administrative AI report failed:', error instanceof Error ? error.message : 'unknown error');
    return sendJson(res, error?.statusCode || 500, { error: error?.statusCode === 503 ? 'The AI service is temporarily busy. Please try again later.' : 'AI report generation failed. Please try again.' });
  }
}
