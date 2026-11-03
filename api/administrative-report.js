import { GoogleGenerativeAI } from '@google/generative-ai';
import { getBearerToken, getSupabaseAdmin, readBody, sendJson } from './_utils/emailjs.js';

const OFFICIAL_STATUS = 'submitted';
const REPORT_TYPE = 'administrative_report';
const MODEL_NAMES = Array.from(new Set([
  process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
]));
const requestCounts = new Map();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 5;

const clean = (value, fallback = '') => String(value ?? fallback).replace(/\s+/g, ' ').trim();
const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};
const dateValue = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : null;
const dateObject = (value) => new Date(`${value}T00:00:00Z`);
const isoDate = (date) => date.toISOString().slice(0, 10);
const addDays = (value, amount) => {
  const date = dateObject(value);
  date.setUTCDate(date.getUTCDate() + amount);
  return isoDate(date);
};
const daysBetween = (start, end) => Math.max(1, Math.round((dateObject(end) - dateObject(start)) / 86400000) + 1);
const monthKey = (value) => String(value).slice(0, 7);
const quarterKey = (value) => `${String(value).slice(0, 4)}-Q${Math.floor((Number(String(value).slice(5, 7)) - 1) / 3) + 1}`;
const percentChange = (current, previous) => previous > 0 ? ((current - previous) / previous) * 100 : null;
const change = (current, previous) => ({
  current,
  previous,
  absolute: current - previous,
  percentage: percentChange(current, previous),
  label: previous > 0 ? `${percentChange(current, previous).toFixed(1)}%` : current > 0 ? 'New activity' : 'No recorded activity',
});
const unique = (values) => [...new Set(values.filter(Boolean))];

const getRange = (body) => {
  const start = dateValue(body.startDate);
  const end = dateValue(body.endDate);
  if (!start || !end || start > end) throw new Error('A valid inclusive reporting date range is required.');
  return { start, end };
};

const previousRange = (periodType, start, end) => {
  const length = daysBetween(start, end);
  if (periodType === 'year') return { start: `${Number(start.slice(0, 4)) - 1}-01-01`, end: `${Number(start.slice(0, 4)) - 1}-12-31` };
  if (periodType === 'quarter') return { start: addDays(start, -length), end: addDays(start, -1) };
  if (periodType === 'month') {
    const first = dateObject(`${start.slice(0, 7)}-01`);
    first.setUTCMonth(first.getUTCMonth() - 1);
    const previousStart = isoDate(first);
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
    return { start: previousStart, end: isoDate(last) };
  }
  return { start: addDays(start, -length), end: addDays(start, -1) };
};

const compareYearAgoRange = (periodType, start, end) => {
  if (!['month', 'quarter', 'year'].includes(periodType)) return null;
  return { start: `${Number(start.slice(0, 4)) - 1}${start.slice(4)}`, end: `${Number(end.slice(0, 4)) - 1}${end.slice(4)}` };
};

const normalizeMode = (establishment) => {
  const mode = String(establishment?.reporting_mode || '').toLowerCase();
  return ['visitor', 'accommodation', 'both'].includes(mode) ? mode : 'visitor';
};
const hasVisitor = (mode) => mode === 'visitor' || mode === 'both';
const hasAccommodation = (mode) => mode === 'accommodation' || mode === 'both';

const fetchAll = async (supabaseAdmin, table, select, start, end) => {
  const rows = [];
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    let query = supabaseAdmin.from(table).select(select).eq('status', OFFICIAL_STATUS).order('report_date', { ascending: true }).range(offset, offset + pageSize - 1);
    if (start && end) query = query.gte('report_date', start).lte('report_date', end);
    const { data, error } = await query;
    if (error) throw new Error(`Unable to load submitted ${table.replace('_', ' ')} data.`);
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
};

const aggregateRows = (visitorRows, accommodationRows, establishments, start, end) => {
  const establishmentMap = new Map(establishments.map((item) => [String(item.id), item]));
  const daily = new Map();
  const monthly = new Map();
  const performance = new Map();
  const add = (key, visitorTotal, guestCheckIns) => {
    const current = daily.get(key) || { period: key, dayTourVisits: 0, guestCheckIns: 0 };
    current.dayTourVisits += visitorTotal;
    current.guestCheckIns += guestCheckIns;
    daily.set(key, current);
  };
  const addMonth = (key, visitorTotal, guestCheckIns) => {
    const current = monthly.get(key) || { period: key, dayTourVisits: 0, guestCheckIns: 0 };
    current.dayTourVisits += visitorTotal;
    current.guestCheckIns += guestCheckIns;
    monthly.set(key, current);
  };
  const addPerformance = (id, type, total, records) => {
    const key = `${id}:${type}`;
    const current = performance.get(key) || { establishmentId: id, type, currentActivity: 0, submittedRecords: 0 };
    current.currentActivity += total;
    current.submittedRecords += records;
    performance.set(key, current);
  };

  visitorRows.forEach((row) => {
    const total = number(row.total_visitors ?? row.total_guests ?? (number(row.total_male) + number(row.total_female)));
    const date = String(row.report_date).slice(0, 10);
    add(date, total, 0); addMonth(monthKey(date), total, 0);
    addPerformance(String(row.establishment_id), 'daytour', total, 1);
  });
  accommodationRows.forEach((row) => {
    const total = number(row.total_check_ins ?? row.guest_check_ins);
    const date = String(row.report_date).slice(0, 10);
    add(date, 0, total); addMonth(monthKey(date), 0, total);
    addPerformance(String(row.establishment_id), 'accommodation', total, 1);
  });

  const visitorEstablishments = unique(visitorRows.map((row) => String(row.establishment_id)));
  const accommodationEstablishments = unique(accommodationRows.map((row) => String(row.establishment_id)));
  const performanceRows = [...performance.values()].map((row) => ({
    ...row,
    establishmentName: establishmentMap.get(row.establishmentId)?.name || 'Unknown establishment',
    reportingMode: normalizeMode(establishmentMap.get(row.establishmentId)),
  })).sort((a, b) => b.currentActivity - a.currentActivity || a.establishmentName.localeCompare(b.establishmentName));

  const dayCount = daysBetween(start, end);
  const expectedDayTour = establishments.filter((row) => hasVisitor(normalizeMode(row))).length * dayCount;
  const expectedAccommodation = establishments.filter((row) => hasAccommodation(normalizeMode(row))).length * dayCount;
  const submittedDayTour = visitorRows.length;
  const submittedAccommodation = accommodationRows.length;
  const visitorTotal = visitorRows.reduce((sum, row) => sum + number(row.total_visitors ?? row.total_guests ?? number(row.total_male) + number(row.total_female)), 0);
  const guestCheckInTotal = accommodationRows.reduce((sum, row) => sum + number(row.total_check_ins ?? row.guest_check_ins), 0);
  const submittedEstablishmentIds = unique([...visitorEstablishments, ...accommodationEstablishments]);

  return {
    dateRange: { startDate: start, endDate: end },
    visitorTotal,
    guestCheckInTotal,
    visitorRecordCount: visitorRows.length,
    accommodationRecordCount: accommodationRows.length,
    establishmentCount: submittedEstablishmentIds.length,
    activeEstablishmentCount: establishments.length,
    daily: [...daily.values()].sort((a, b) => a.period.localeCompare(b.period)),
    monthly: [...monthly.values()].sort((a, b) => a.period.localeCompare(b.period)),
    performance: performanceRows,
    completeness: {
      expectedDayTour, submittedDayTour, missingDayTour: Math.max(0, expectedDayTour - submittedDayTour),
      expectedAccommodation, submittedAccommodation, missingAccommodation: Math.max(0, expectedAccommodation - submittedAccommodation),
      expectedTotal: expectedDayTour + expectedAccommodation,
      submittedTotal: submittedDayTour + submittedAccommodation,
      percentage: expectedDayTour + expectedAccommodation > 0 ? ((submittedDayTour + submittedAccommodation) / (expectedDayTour + expectedAccommodation)) * 100 : null,
      basis: 'Estimated from active establishment reporting modes and one expected report per calendar day.',
    },
  };
};

const buildSnapshot = async (supabaseAdmin, range, periodType) => {
  const [establishments, visitorRows, accommodationRows] = await Promise.all([
    supabaseAdmin.from('establishments').select('id,name,reporting_mode,status').eq('status', 'active').order('name', { ascending: true }).then(({ data, error }) => { if (error) throw new Error('Unable to load active establishments.'); return data || []; }),
    fetchAll(supabaseAdmin, 'visitor_reports', 'id,establishment_id,report_date,total_guests,total_visitors,total_male,total_female', range.start, range.end),
    fetchAll(supabaseAdmin, 'accommodation_reports', 'id,establishment_id,report_date,total_check_ins,guest_check_ins', range.start, range.end),
  ]);
  const current = aggregateRows(visitorRows, accommodationRows, establishments, range.start, range.end);
  const previous = previousRange(periodType, range.start, range.end);
  const [previousVisitors, previousAccommodation] = await Promise.all([
    fetchAll(supabaseAdmin, 'visitor_reports', 'id,establishment_id,report_date,total_guests,total_visitors,total_male,total_female', previous.start, previous.end),
    fetchAll(supabaseAdmin, 'accommodation_reports', 'id,establishment_id,report_date,total_check_ins,guest_check_ins', previous.start, previous.end),
  ]);
  const previousTotals = aggregateRows(previousVisitors, previousAccommodation, establishments, previous.start, previous.end);
  let yearAgo = null;
  const yearAgoRange = compareYearAgoRange(periodType, range.start, range.end);
  if (yearAgoRange) {
    const [yearVisitors, yearAccommodation] = await Promise.all([
      fetchAll(supabaseAdmin, 'visitor_reports', 'id,establishment_id,report_date,total_guests,total_visitors,total_male,total_female', yearAgoRange.start, yearAgoRange.end),
      fetchAll(supabaseAdmin, 'accommodation_reports', 'id,establishment_id,report_date,total_check_ins,guest_check_ins', yearAgoRange.start, yearAgoRange.end),
    ]);
    const totals = aggregateRows(yearVisitors, yearAccommodation, establishments, yearAgoRange.start, yearAgoRange.end);
    yearAgo = { dateRange: yearAgoRange, visitorTotal: totals.visitorTotal, guestCheckInTotal: totals.guestCheckInTotal };
  }
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const periodCompleteThrough = range.end < today ? range.end : today;
  return {
    ...current,
    periodType,
    comparison: { dateRange: previous, dayTourVisits: change(current.visitorTotal, previousTotals.visitorTotal), guestCheckIns: change(current.guestCheckInTotal, previousTotals.guestCheckInTotal), yearAgo },
    previousPerformance: previousTotals.performance,
    dataQuality: { isPartialPeriod: range.end >= today, periodCompleteThrough, notes: [ ...(range.end >= today ? ['The selected period is ongoing or extends into the future.'] : []), ...(current.visitorRecordCount === 0 && current.accommodationRecordCount === 0 ? ['No submitted source records were found for this period.'] : []) ] },
    generatedAt: new Date().toISOString(),
  };
};

const fallbackNarrative = (source) => ({
  status: 'fallback',
  model: 'deterministic-fallback',
  executiveSummary: `The selected period contains ${source.visitorTotal.toLocaleString()} recorded day-tour visits and ${source.guestCheckInTotal.toLocaleString()} accommodation guest check-ins. These measures are separate and do not represent unique municipal visitors.`,
  dayTourAnalysis: `Day-tour activity changed by ${source.comparison.dayTourVisits.label} from the comparable previous period.`,
  accommodationAnalysis: `Accommodation guest check-ins changed by ${source.comparison.guestCheckIns.label} from the comparable previous period.`,
  recommendations: source.dataQuality.notes.length ? ['Review the listed data-quality limitations before finalizing the report.'] : ['Continue monitoring submitted activity by reporting type and period.'],
});

const forbiddenNarrative = /\b(?:wifi|wi-fi|internet|room|rooms|amenit(?:y|ies)|facility|facilities|price|prices|revenue|award|awards|availability|available|occupancy|cause|caused|event|festival|weather|safety|rating|ratings)\b/i;
const safeNarrative = (generated, source) => {
  if (!generated || typeof generated !== 'object') return fallbackNarrative(source);
  const fields = ['executiveSummary', 'dayTourAnalysis', 'accommodationAnalysis'];
  const recommendations = Array.isArray(generated.recommendations) ? generated.recommendations.slice(0, 3) : [];
  const values = [...fields.map((key) => generated[key]), ...recommendations];
  if (values.some((value) => typeof value !== 'string' || value.length > 420 || forbiddenNarrative.test(value) || /\d/.test(value))) return fallbackNarrative(source);
  return { status: 'generated', model: clean(generated.model, 'configured-gemini'), ...Object.fromEntries(fields.map((key) => [key, clean(generated[key])])), recommendations: recommendations.map((item) => clean(item)) };
};

const generateNarrative = async (source) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallbackNarrative(source);
  const evidence = {
    periodType: source.periodType,
    dateRange: source.dateRange,
    dayTourVisits: source.visitorTotal,
    accommodationGuestCheckIns: source.guestCheckInTotal,
    previousComparison: source.comparison,
    reportingCompleteness: source.completeness,
    dataQuality: source.dataQuality,
    monthlyTrend: source.monthly,
  };
  const prompt = `You are writing a concise formal administrative interpretation for a municipal tourism officer. Use only this verified JSON evidence. Return JSON with exactly executiveSummary, dayTourAnalysis, accommodationAnalysis, recommendations. Keep each paragraph under 45 words and each recommendation under 18 words. Do not include digits or percentages in prose because verified figures are displayed separately. Do not invent causes, events, revenue, occupancy, rooms, amenities, prices, availability, awards, ratings, or visitor uniqueness. State limitations when evidence is incomplete.\nVERIFIED EVIDENCE:\n${JSON.stringify(evidence)}`;
  try {
    for (const modelName of MODEL_NAMES) {
      try {
        const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: modelName });
        const response = await model.generateContent(prompt);
        const text = await response.response.text();
        const match = text.match(/\{[\s\S]*\}/);
        const parsed = match ? JSON.parse(match[0]) : null;
        return safeNarrative({ ...parsed, model: modelName }, source);
      } catch (error) {
        const message = String(error?.message || error);
        if (!/(404|429|500|502|503|unavailable|not found|high demand)/i.test(message)) throw error;
      }
    }
  } catch (error) {
    console.error('Administrative narrative generation failed:', error instanceof Error ? error.message : 'unknown error');
  }
  return fallbackNarrative(source);
};

const isOfficer = (profile) => profile?.role === 'municipal_officer' && profile?.status === 'active';
const rateLimit = (userId) => {
  const now = Date.now();
  const current = requestCounts.get(userId);
  if (!current || now - current.startedAt >= WINDOW_MS) { requestCounts.set(userId, { startedAt: now, count: 1 }); return true; }
  if (current.count >= MAX_REQUESTS) return false;
  current.count += 1; return true;
};
const authorized = async (req) => {
  const token = getBearerToken(req);
  if (!token) return null;
  const supabaseAdmin = getSupabaseAdmin();
  const { data: userData, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !userData?.user?.id) return null;
  const { data: profile } = await supabaseAdmin.from('profiles').select('id,role,status,full_name').eq('id', userData.user.id).maybeSingle();
  if (!isOfficer(profile)) return null;
  return { supabaseAdmin, userId: userData.user.id, profile };
};

const readSaved = async (supabaseAdmin, periodKey) => {
  const { data, error } = await supabaseAdmin.from('ai_insights_cache').select('id,period,data,generated_at').eq('insight_type', REPORT_TYPE).eq('period', periodKey).eq('is_active', true).order('generated_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error('Unable to load saved administrative reports.');
  return data ? { id: data.id, periodKey: data.period, generatedAt: data.generated_at, report: data.data?.report || data.data } : null;
};
const readHistory = async (supabaseAdmin) => {
  const { data, error } = await supabaseAdmin.from('ai_insights_cache').select('id,period,data,generated_at').eq('insight_type', REPORT_TYPE).eq('is_active', true).order('generated_at', { ascending: false }).limit(50);
  if (error) throw new Error('Unable to load report history.');
  return (data || []).map((row) => ({ id: row.id, periodKey: row.period, generatedAt: row.generated_at, report: row.data?.report || row.data }));
};
const saveReport = async (supabaseAdmin, periodKey, report, existingId = null) => {
  const payload = { insight_type: REPORT_TYPE, establishment_id: null, period: periodKey, data: { report }, generated_at: new Date().toISOString(), expires_at: null, is_active: true };
  if (existingId) {
    const { error } = await supabaseAdmin.from('ai_insights_cache').update(payload).eq('id', existingId);
    if (error) throw new Error('Unable to save the administrative report.');
    return existingId;
  }
  const { data, error } = await supabaseAdmin.from('ai_insights_cache').insert(payload).select('id').single();
  if (error) throw new Error('Unable to save the administrative report.');
  return data.id;
};

export { aggregateRows, change, getRange, previousRange, safeNarrative };

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  try {
    const auth = await authorized(req);
    if (!auth) return sendJson(res, 403, { error: 'Only active municipal officers can access administrative reports.' });
    if (!rateLimit(auth.userId)) return sendJson(res, 429, { error: 'Too many report requests. Please try again later.' });
    const body = await readBody(req);
    const action = clean(body.action, 'data');
    if (action === 'history') return sendJson(res, 200, { history: await readHistory(auth.supabaseAdmin) });
    const periodKey = clean(body.periodKey);
    if (action === 'get') return sendJson(res, 200, { saved: periodKey ? await readSaved(auth.supabaseAdmin, periodKey) : null });
    if (action === 'data') {
      const range = getRange(body);
      const source = await buildSnapshot(auth.supabaseAdmin, range, clean(body.periodType, 'month'));
      return sendJson(res, 200, { source });
    }
    if (action === 'generate') {
      const range = getRange(body);
      if (!periodKey) return sendJson(res, 400, { error: 'A report period is required.' });
      if (body.forceRegenerate !== true) {
        const saved = await readSaved(auth.supabaseAdmin, periodKey);
        if (saved) return sendJson(res, 200, { ...saved, cached: true });
      }
      const source = await buildSnapshot(auth.supabaseAdmin, range, clean(body.periodType, 'month'));
      const narrative = await generateNarrative(source);
      const report = { title: clean(body.title, 'Tourism Performance and Administrative Report'), periodLabel: clean(body.periodLabel, periodKey), status: 'Draft', generatedBy: auth.profile.full_name || 'Municipal Tourism Officer', source, narrative, recommendations: narrative.recommendations, edits: null, approvalHistory: [] };
      const id = await saveReport(auth.supabaseAdmin, periodKey, report);
      return sendJson(res, 200, { id, periodKey, generatedAt: report.source.generatedAt, report, cached: false });
    }
    if (['save_edit', 'submit_review', 'request_revision', 'approve'].includes(action)) {
      if (!periodKey) return sendJson(res, 400, { error: 'A report period is required.' });
      const saved = await readSaved(auth.supabaseAdmin, periodKey);
      if (!saved) return sendJson(res, 404, { error: 'Saved report not found.' });
      const report = { ...saved.report };
      if (action === 'save_edit') report.edits = { executiveSummary: clean(body.executiveSummary), recommendations: Array.isArray(body.recommendations) ? body.recommendations.map((item) => clean(item)).filter(Boolean).slice(0, 10) : report.edits?.recommendations || report.recommendations };
      if (action === 'submit_review') report.status = 'For Review';
      if (action === 'request_revision') report.status = 'Revision Required';
      if (action === 'approve') report.status = 'Approved';
      report.approvalHistory = [...(report.approvalHistory || []), { action, actor: auth.profile.full_name || auth.userId, at: new Date().toISOString() }];
      await saveReport(auth.supabaseAdmin, periodKey, report, saved.id);
      return sendJson(res, 200, { id: saved.id, periodKey, report });
    }
    return sendJson(res, 400, { error: 'Unsupported administrative report action.' });
  } catch (error) {
    console.error('Administrative report request failed:', error instanceof Error ? error.message : 'unknown error');
    return sendJson(res, 500, { error: error instanceof Error ? error.message : 'Administrative report request failed.' });
  }
}
