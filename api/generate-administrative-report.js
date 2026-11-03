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

const aggregateRows = (rows) => {
  const groups = Object.fromEntries(PERIOD_TYPES.map((periodType) => [periodType, new Map()]));
  rows.forEach((row) => {
    if (!row?.report_date) return;
    const date = String(row.report_date).slice(0, 10);
    const year = date.slice(0, 4);
    const monthNumber = Number(date.slice(5, 7));
    const keys = {
      weekly: getIsoWeekKey(date),
      monthly: date.slice(0, 7),
      quarterly: `${year}-Q${Math.floor((monthNumber - 1) / 3) + 1}`,
      yearly: year,
    };
    PERIOD_TYPES.forEach((periodType) => {
      const key = keys[periodType];
      const current = groups[periodType].get(key) || { visitorTotal: 0, reportCount: 0, establishments: new Set() };
      current.visitorTotal += Number(row.total_guests || 0);
      current.reportCount += 1;
      if (row.establishment_id) current.establishments.add(String(row.establishment_id));
      groups[periodType].set(key, current);
    });
  });
  return Object.fromEntries(PERIOD_TYPES.map((periodType) => [
    periodType,
    [...groups[periodType].entries()].sort(([a], [b]) => a.localeCompare(b)).map(([period, value]) => ({
      period,
      visitorTotal: value.visitorTotal,
      reportCount: value.reportCount,
      establishmentCount: value.establishments.size,
    })),
  ]));
};

const loadSourceData = async (supabaseAdmin, startDate, endDate) => {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabaseAdmin
      .from('visitor_reports')
      .select('report_date,total_guests,establishment_id')
      .eq('status', 'submitted')
      .gte('report_date', startDate)
      .lte('report_date', endDate)
      .order('report_date', { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error('Unable to load submitted visitor data from the system');
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  const aggregates = aggregateRows(rows);
  return {
    dateRange: { startDate, endDate },
    submittedReportCount: rows.length,
    visitorTotal: rows.reduce((sum, row) => sum + Number(row.total_guests || 0), 0),
    establishmentCount: new Set(rows.map((row) => row.establishment_id).filter(Boolean).map(String)).size,
    aggregates,
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
  if (!report || typeof report !== 'object' || !report.source) return null;
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

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return sendJson(res, 503, { error: 'AI service is not configured' });
    const periodLabel = clean(body?.periodLabel, 160) || 'the selected period';
    const startDate = clean(body?.startDate, 10);
    const endDate = clean(body?.endDate, 10);
    if (!isDate(startDate) || !isDate(endDate) || startDate > endDate) return sendJson(res, 400, { error: 'A valid report date range is required.' });
    const source = await loadSourceData(supabaseAdmin, startDate, endDate);
    if (source.submittedReportCount === 0) return sendJson(res, 400, { error: 'No submitted visitor data is available for this period.' });

const prompt = `You are an administrative tourism reporting assistant. Create a detailed report for ${periodLabel} using ONLY the server-verified source data below. Return ONLY valid JSON with exactly these string fields: overview, weekly, monthly, quarterly, yearly, followUp. Each aggregation field must be 2 to 5 sentences and explicitly summarize only available period rows, visitor totals, report counts, and establishment counts. You may repeat only numbers and period labels present in the source data. Do not calculate new totals or invent values, trends, causes, comparisons, or recommendations. If a period has no rows, say that no submitted visitor data was available for that aggregation. Do not approve, reject, or evaluate individual establishments. Do not mention AI, prompts, hidden data, or report IDs.\n\nServer-verified source data:\n${JSON.stringify(source)}`;
    const result = await generateWithFallback(apiKey, prompt);
    const generated = parseJsonObject(await result.text);
    const report = {
      overview: normalizeSection(generated.overview, `The system verified ${source.submittedReportCount} submitted visitor reports containing ${source.visitorTotal} visitors.`),
      weekly: normalizeSection(generated.weekly, 'No weekly summary was returned.'),
      monthly: normalizeSection(generated.monthly, 'No monthly summary was returned.'),
      quarterly: normalizeSection(generated.quarterly, 'No quarterly summary was returned.'),
      yearly: normalizeSection(generated.yearly, 'No yearly summary was returned.'),
      followUp: normalizeSection(generated.followUp, 'Verify the source totals before official use.'),
      source,
    };
    await saveCachedReport(supabaseAdmin, { periodKey, periodLabel, report, modelName: result.modelName, source });
    return sendJson(res, 200, { report, model: result.modelName, cached: false, saved: true, generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Administrative AI report failed:', error instanceof Error ? error.message : 'unknown error');
    return sendJson(res, error?.statusCode || 500, { error: error?.statusCode === 503 ? 'The AI service is temporarily busy. Please try again later.' : 'AI report generation failed. Please try again.' });
  }
}
