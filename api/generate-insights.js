import { GoogleGenerativeAI } from '@google/generative-ai';
import { getBearerToken, getSupabaseAdmin, readBody, sendJson } from './_utils/emailjs.js';

const MODEL_NAME = 'gemini-3.6-flash';
const OFFICIAL_REPORT_STATUS = 'submitted';
const requestCounts = new Map();
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 5;

const clean = (value, fallback = '') => String(value || fallback).replace(/\s+/g, ' ').trim();
const confidence = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 0.65;
};
const jsonObject = (text) => {
  const match = String(text).match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : {};
};
const normalizeInsights = (items) => (Array.isArray(items) ? items : []).map((item) => ({
  title: clean(item.title, 'Tourism insight'),
  description: clean(item.description),
  impact: clean(item.impact, 'medium').toLowerCase(),
  category: clean(item.category, 'Operations'),
  recommended_action: clean(item.recommended_action || item.action, 'Review this trend and take one focused action.'),
  confidence_score: confidence(item.confidence_score),
}));
const normalizeAnomalies = (items) => (Array.isArray(items) ? items : []).map((item) => ({
  type: clean(item.type || item.anomaly_type, 'Operational anomaly'),
  severity: clean(item.severity, 'medium').toLowerCase(),
  description: clean(item.description),
  recommendation: clean(item.recommendation || item.recommended_action, 'Review this record manually.'),
  establishment: item.establishment ? clean(item.establishment) : undefined,
  confidence_score: confidence(item.confidence_score),
}));
const rateLimit = (userId) => {
  const now = Date.now();
  const current = requestCounts.get(userId) || { startedAt: now, count: 0 };
  if (now - current.startedAt >= WINDOW_MS) {
    requestCounts.set(userId, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= MAX_REQUESTS_PER_WINDOW) return false;
  current.count += 1;
  requestCounts.set(userId, current);
  return true;
};
const isOfficer = (profile) => profile?.role === 'municipal_officer' && profile?.status === 'active';
const isStaff = (profile) => profile?.role === 'establishment_staff' && profile?.status === 'active' && Boolean(profile.establishment_id);

const getScopedData = async (supabaseAdmin, profile, scope) => {
  const establishmentFilter = scope === 'establishment' ? profile.establishment_id : null;
  const visitorQuery = supabaseAdmin
    .from('visitor_reports')
    .select('report_date,total_guests,residence_type,establishments(name)')
    .eq('status', OFFICIAL_REPORT_STATUS)
    .order('report_date', { ascending: false })
    .limit(500);
  const accommodationQuery = supabaseAdmin
    .from('accommodation_reports')
    .select('report_date,total_rooms,total_occupied_rooms')
    .eq('status', OFFICIAL_REPORT_STATUS)
    .limit(500);
  if (establishmentFilter) {
    visitorQuery.eq('establishment_id', establishmentFilter);
    accommodationQuery.eq('establishment_id', establishmentFilter);
  }
  const [{ data: visitorData, error: visitorError }, { data: accommodationData, error: accommodationError }] = await Promise.all([visitorQuery, accommodationQuery]);
  if (visitorError || accommodationError) throw new Error('Unable to load submitted tourism data');

  const visitors = visitorData || [];
  const accommodation = accommodationData || [];
  const totalVisitors = visitors.reduce((sum, row) => sum + Number(row.total_guests || 0), 0);
  const totalRooms = accommodation.reduce((sum, row) => sum + Number(row.total_rooms || 0), 0);
  const totalOccupied = accommodation.reduce((sum, row) => sum + Number(row.total_occupied_rooms || 0), 0);
  const monthlyTrends = {};
  visitors.forEach((row) => {
    if (row.report_date) monthlyTrends[row.report_date.slice(0, 7)] = (monthlyTrends[row.report_date.slice(0, 7)] || 0) + Number(row.total_guests || 0);
  });
  return {
    visitors,
    totalVisitors,
    avgOccupancy: totalRooms > 0 ? (totalOccupied / totalRooms) * 100 : 0,
    monthlyTrends,
    establishmentName: scope === 'establishment' ? 'this establishment' : 'Balayan municipality',
  };
};

const generate = async (model, data, scope) => {
  const insightsPrompt = `You are a tourism data analyst for ${data.establishmentName}. Based only on these aggregate submitted-report values, return exactly ${scope === 'establishment' ? 3 : 4} concise recommendations as JSON: {"insights":[{"title":"max 6 words","description":"one sentence max 18 words with evidence","impact":"high|medium|low","category":"Seasonal|Operations|Marketing|Infrastructure","recommended_action":"one action sentence max 14 words","confidence_score":0.0}]}. Total visitors: ${data.totalVisitors}. Average occupancy: ${data.avgOccupancy}%. Monthly trends: ${JSON.stringify(data.monthlyTrends)}. Do not include personal data or invent facts.`;
  const anomalyPrompt = `You are a tourism data analyst for ${data.establishmentName}. Analyze only these submitted aggregate visitor rows and return JSON {"anomalies":[{"type":"Unusual Drop","severity":"high|medium|low","description":"brief evidence-based description","recommendation":"brief action","establishment":"${data.establishmentName}","confidence_score":0.0}]}. Data: ${JSON.stringify(data.visitors.slice(0, 50))}. Do not include personal data or invent facts.`;
  const [insightResult, anomalyResult] = await Promise.all([model.generateContent(insightsPrompt), model.generateContent(anomalyPrompt)]);
  const insights = normalizeInsights(jsonObject(await insightResult.response.text()).insights);
  const anomalies = normalizeAnomalies(jsonObject(await anomalyResult.response.text()).anomalies);
  return { insights, anomalies };
};

const insertResults = async (supabaseAdmin, results, scope, establishmentId) => {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  if (results.insights.length) {
    const rows = results.insights.map((item) => ({ ...item, model_name: MODEL_NAME, establishment_id: scope === 'establishment' ? establishmentId : null, status: 'active', expires_at: expiresAt }));
    const { error } = await supabaseAdmin.from('ai_recommendations').insert(rows);
    if (error) throw new Error('Unable to save generated recommendations');
  }
  if (results.anomalies.length) {
    const rows = results.anomalies.map((item) => ({ anomaly_type: item.type, severity: item.severity, description: item.description, recommendation: item.recommendation, establishment_id: scope === 'establishment' ? establishmentId : null, model_name: MODEL_NAME, status: 'active', is_resolved: false, detected_at: new Date().toISOString() }));
    const { error } = await supabaseAdmin.from('ai_anomalies_cache').insert(rows);
    if (error) throw new Error('Unable to save generated anomalies');
  }
  const { error: cacheError } = await supabaseAdmin.from('ai_insights_cache').insert({ insight_type: 'recommendations', establishment_id: scope === 'establishment' ? establishmentId : null, data: { insights: results.insights, scope }, generated_at: new Date().toISOString(), expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });
  if (cacheError) throw new Error('Unable to save generated insight cache');
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  try {
    const token = getBearerToken(req);
    if (!token) return sendJson(res, 401, { error: 'Authentication required' });
    const supabaseAdmin = getSupabaseAdmin();
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !userData?.user?.id) return sendJson(res, 401, { error: 'Invalid session' });
    const { data: profile, error: profileError } = await supabaseAdmin.from('profiles').select('id,role,status,establishment_id').eq('id', userData.user.id).maybeSingle();
    if (profileError || (!isOfficer(profile) && !isStaff(profile))) return sendJson(res, 403, { error: 'AI insights are not available for this account' });
    if (!rateLimit(userData.user.id)) return sendJson(res, 429, { error: 'Too many AI requests. Please try again later.' });
    const body = await readBody(req);
    const scope = body.scope === 'establishment' ? 'establishment' : body.scope === 'municipality' ? 'municipality' : null;
    if (!scope || (scope === 'municipality' && !isOfficer(profile)) || (scope === 'establishment' && !isStaff(profile))) return sendJson(res, 403, { error: 'You are not authorized for this AI scope' });
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return sendJson(res, 503, { error: 'AI service is not configured' });
    const data = await getScopedData(supabaseAdmin, profile, scope);
    const results = await generate(new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: MODEL_NAME }), data, scope);
    await insertResults(supabaseAdmin, results, scope, profile.establishment_id);
    return sendJson(res, 200, results);
  } catch (error) {
    console.error('AI generation failed:', error instanceof Error ? error.message : 'unknown error');
    return sendJson(res, 500, { error: 'AI generation failed. Please try again.' });
  }
}
