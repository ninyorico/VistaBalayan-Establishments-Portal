import crypto from 'node:crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getBearerToken, getSupabaseAdmin, readBody, sendJson } from './_utils/emailjs.js';
import { aggregateMonthlyMetrics, buildDeterministicAnomalies, coverageConfidence, hasConsistentAnomalyEvidence } from '../src/lib/tourismMetrics.js';

const MODEL_NAMES = Array.from(new Set([
  process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.5-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash',
]));
const OFFICIAL_REPORT_STATUS = 'submitted';
const requestCounts = new Map();
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 5;

const MAX_AI_ITEMS = 10;

const clean = (value, fallback = '') => String(value || fallback).replace(/\s+/g, ' ').trim();
const jsonObject = (text) => {
  const raw = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI response did not contain a JSON object');
  const candidate = raw.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch (error) {
    const repaired = candidate
      .replace(/,\s*([}\]])/g, '$1');
    try {
      return JSON.parse(repaired);
    } catch {
      const position = error instanceof SyntaxError && /position (\d+)/.test(error.message) ? error.message.match(/position (\d+)/)?.[1] : 'unknown';
      throw new Error(`AI response JSON is invalid near position ${position}`);
    }
  }
};
const normalizeAction = (action, allowedEvidenceIds = new Set()) => {
  if (!action || typeof action !== 'object') return null;
  const successIndicators = Array.isArray(action.success_indicators) ? action.success_indicators.map((value) => clean(value)).filter(Boolean).slice(0, 5) : [];
  const normalized = {
    action_title: clean(action.action_title || action.title),
    action_description: clean(action.action_description || action.description || action.recommended_action || action.action),
    primary_objective: clean(action.primary_objective || action.objective),
    recommendation_class: clean(action.recommendation_class || action.class || action.action_category || action.category),
    action_priority: clean(action.action_priority || action.priority),
    action_category: clean(action.action_category || action.category),
    responsible_entity: clean(action.responsible_entity || action.responsible),
    suggested_timeframe: clean(action.suggested_timeframe || action.timeframe),
    supporting_evidence_ids: (Array.isArray(action.supporting_evidence_ids) ? action.supporting_evidence_ids : []).map((value) => clean(value)).filter((value) => allowedEvidenceIds.has(value)).slice(0, 8),
    prerequisites: Array.isArray(action.prerequisites) ? action.prerequisites.map((value) => clean(value)).filter(Boolean).slice(0, 5) : [],
    success_indicators: successIndicators,
    validation_required: action.validation_required === true,
  };
  if (!normalized.action_title || !normalized.action_description || !normalized.responsible_entity || !normalized.suggested_timeframe || !successIndicators.length || !normalized.supporting_evidence_ids.length) return null;
  return normalized;
};
const confidenceForMetric = (metric, coverageByMetric) => coverageByMetric[metric] || 'Not calculated';
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const peakMonthName = (monthlyMetrics) => {
  const peak = (Array.isArray(monthlyMetrics) ? monthlyMetrics : []).reduce((best, row) => {
    const score = Number(row?.totalVisitors || 0) + Number(row?.totalGuestCheckIns || 0);
    return !best || score > best.score ? { month: row?.month, score } : best;
  }, null);
  const monthIndex = typeof peak?.month === 'string' ? Number(peak.month.slice(5, 7)) - 1 : -1;
  return monthIndex >= 0 && monthIndex < MONTH_NAMES.length ? MONTH_NAMES[monthIndex] : null;
};
const normalizePriority = (value, metric, confidence) => {
  if ((metric === 'dayTourVisitors' || metric === 'overnightGuestCheckIns') && confidence === 'Very Low') return 'High';
  const priority = clean(value).toLowerCase();
  return ['critical', 'high', 'medium', 'low'].includes(priority) ? priority[0].toUpperCase() + priority.slice(1) : 'Medium';
};
const gateActions = (actions, metric, confidence, monthlyMetrics = []) => actions.filter((action) => {
  const text = `${action.recommendation_class} ${action.action_category} ${action.action_title} ${action.action_description} ${action.success_indicators.join(' ')}`.toLowerCase();
  const strategic = /strategic|promotion|tourism development|tourism planning|resource allocation|accommodation development|campaign|package|partnership/.test(text);
  if (strategic && confidence === 'Very Low' && !action.validation_required) return false;
  if (/tourism statistics officer|tourism statistics unit|tourism data analyst|tourism policy committee/.test(text)) return false;
  if (metric === 'seasonality') {
    const peak = peakMonthName(monthlyMetrics);
    const referencedMonths = MONTH_NAMES.filter((month) => text.includes(month.toLowerCase()));
    if (referencedMonths.length && (!peak || referencedMonths.some((month) => month !== peak))) return false;
  }
  return true;
});

const normalizeInsights = (items, coverageByMetric = {}, analysisPeriod = null, allowedEvidenceIds = new Set(), monthlyMetrics = []) => (Array.isArray(items) ? items : []).slice(0, MAX_AI_ITEMS).map((item) => {
  const confidence = confidenceForMetric(item.metric, coverageByMetric);
  const actions = gateActions((Array.isArray(item.recommended_actions) ? item.recommended_actions : [item.recommended_action || item.action]).map((action) => normalizeAction(action, allowedEvidenceIds)).filter((action) => action?.action_description).slice(0, 4), item.metric, confidence, monthlyMetrics);
  const decisionSupport = {
    insight_category: clean(item.insight_category || item.category, 'Operations'),
    priority: normalizePriority(item.priority || item.impact, item.metric, confidenceForMetric(item.metric, coverageByMetric)),
    analysis_period: clean(item.analysis_period),
    geographic_scope: clean(item.geographic_scope, 'Balayan municipality'),
    data_confidence: confidenceForMetric(item.metric, coverageByMetric),
    data_limitations: Array.isArray(item.data_limitations) ? item.data_limitations.map((value) => clean(value)).filter(Boolean).slice(0, 5) : [],
    decision_implication: clean(item.decision_implication),
    recommended_actions: actions,
    responsible_entities: Array.isArray(item.responsible_entities) ? item.responsible_entities.map((value) => clean(value)).filter(Boolean).slice(0, 5) : [],
    suggested_timeframe: clean(item.suggested_timeframe),
    expected_outcome: clean(item.expected_outcome),
    success_indicators: Array.isArray(item.success_indicators) ? item.success_indicators.map((value) => clean(value)).filter(Boolean).slice(0, 8) : [],
    validation_required: item.validation_required !== false,
    related_evidence_ids: Array.isArray(item.related_evidence_ids) ? item.related_evidence_ids.map((value) => clean(value)).filter((value) => allowedEvidenceIds.has(value)).slice(0, 8) : [],
  };
  return {
    title: clean(item.title || item.insight_title, 'Tourism insight'),
    description: clean(item.description || item.ai_insight),
    impact: clean(item.impact || item.priority, 'medium').toLowerCase(),
    category: decisionSupport.insight_category,
    recommended_action: actions[0]?.action_description || '',
    input_snapshot: item.metric ? { metric: clean(item.metric), analysis_period: analysisPeriod, related_evidence_ids: decisionSupport.related_evidence_ids, decision_support: decisionSupport } : null,
  };
});
const deduplicateInsightActions = (insights) => {
  const seenObjectives = new Set();
  return insights.map((insight) => {
    const localObjectives = new Set();
    const actions = (insight.input_snapshot?.decision_support?.recommended_actions || []).filter((action) => {
      const text = `${action.primary_objective || ''} ${action.action_title || ''} ${action.action_description || ''}`.toLowerCase();
      const isReportingObjective = /missing|reporting|coverage|outstanding|submission/.test(text);
      const objective = isReportingObjective
        ? 'shared-reporting-completeness'
        : clean(action.primary_objective || action.action_title || action.action_description).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (!objective || localObjectives.has(objective) || (isReportingObjective && seenObjectives.has(objective))) return false;
      localObjectives.add(objective);
      seenObjectives.add(objective);
      return true;
    });
    return {
      ...insight,
      recommended_action: actions[0]?.action_description || '',
      input_snapshot: insight.input_snapshot ? {
        ...insight.input_snapshot,
        decision_support: { ...insight.input_snapshot.decision_support, recommended_actions: actions },
      } : insight.input_snapshot,
    };
  });
};

const normalizeAnomalies = (items) => (Array.isArray(items) ? items : []).slice(0, MAX_AI_ITEMS).map((item) => ({
  type: clean(item.type || item.anomaly_type, 'Operational anomaly'),
  severity: clean(item.severity, 'medium').toLowerCase(),
  description: clean(item.description),
  recommendation: clean(item.recommendation || item.recommended_action),
  establishment: item.establishment ? clean(item.establishment) : undefined,
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
const isStaff = (profile, establishmentStatus) => profile?.role === 'establishment_staff' && profile?.status === 'active' && establishmentStatus === 'active' && Boolean(profile.establishment_id);

const isRetryableModelError = (error) => {
  const message = error instanceof Error ? error.message : String(error || '');
  return /\[(?:404|429|500|502|503)\b|status\s*[:=]?\s*(?:404|429|500|502|503)|not found|high demand|temporarily unavailable|unavailable/i.test(message);
};

const generateContentWithFallback = async (apiKey, prompt) => {
  let lastError = null;
  for (const modelName of MODEL_NAMES) {
    try {
      const model = new GoogleGenerativeAI(apiKey).getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      return { ...result, modelName };
    } catch (error) {
      lastError = error;
      const providerStatus = error?.status || error?.statusCode || error?.response?.status || 'unknown';
      const retryable = isRetryableModelError(error);
      console.error('AI model attempt failed', { model: modelName, providerStatus, retryable });
      if (!retryable) throw error;
    }
  }
  const serviceError = new Error('AI generation models are temporarily unavailable');
  serviceError.statusCode = 503;
  serviceError.cause = lastError;
  throw serviceError;
};

const getAllRows = async (queryFactory) => {
  const pageSize = 1000;
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await queryFactory(offset, pageSize);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
};

const normalizeAnalysisPeriod = (value) => {
  if (!value || typeof value !== 'object') return null;
  const dates = ['selectedStartDate', 'selectedEndDate', 'comparisonStartDate', 'comparisonEndDate'].map((key) => clean(value[key])).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));
  if (!dates.length) return null;
  return {
    ...value,
    queryStart: dates.sort()[0],
    queryEnd: dates.sort().at(-1),
    label: clean(value.label),
  };
};

const getScopedData = async (supabaseAdmin, profile, scope, analysisPeriod = null) => {
  const establishmentFilter = scope === 'establishment' ? profile.establishment_id : null;
  const visitorRows = await getAllRows((offset, pageSize) => {
    let query = supabaseAdmin
      .from('visitor_reports')
      .select('report_date,created_at,total_guests,residence_type,establishment_id,establishments(name)')
      .eq('status', OFFICIAL_REPORT_STATUS)
      .order('report_date', { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (analysisPeriod?.queryStart) query = query.gte('report_date', analysisPeriod.queryStart).lte('report_date', analysisPeriod.queryEnd);
    if (establishmentFilter) query = query.eq('establishment_id', establishmentFilter);
    return query;
  });
  const accommodationRows = await getAllRows((offset, pageSize) => {
    let query = supabaseAdmin
      .from('accommodation_reports')
      .select('report_date,created_at,total_rooms,total_occupied_rooms,total_check_ins,establishment_id')
      .eq('status', OFFICIAL_REPORT_STATUS)
      .order('report_date', { ascending: false })
      .range(offset, offset + pageSize - 1);
    if (analysisPeriod?.queryStart) query = query.gte('report_date', analysisPeriod.queryStart).lte('report_date', analysisPeriod.queryEnd);
    if (establishmentFilter) query = query.eq('establishment_id', establishmentFilter);
    return query;
  });

  let eligibleVisitorEstablishments = 0;
  let eligibleAccommodationEstablishments = 0;
  if (scope === 'municipality') {
    const { data: establishments, error } = await supabaseAdmin
      .from('establishments')
      .select('id,reporting_mode,status')
      .eq('status', 'active');
    if (error) throw error;
    eligibleVisitorEstablishments = (establishments || []).filter((row) => row.reporting_mode === 'visitor' || row.reporting_mode === 'both').length;
    eligibleAccommodationEstablishments = (establishments || []).filter((row) => row.reporting_mode === 'accommodation' || row.reporting_mode === 'both').length;
  } else {
    eligibleVisitorEstablishments = visitorRows.length > 0 ? 1 : 0;
    eligibleAccommodationEstablishments = accommodationRows.length > 0 ? 1 : 0;
  }

  const monthlyMetrics = aggregateMonthlyMetrics(visitorRows, accommodationRows, eligibleVisitorEstablishments, eligibleAccommodationEstablishments, analysisPeriod ? { startDate: analysisPeriod.queryStart, endDate: analysisPeriod.queryEnd } : null);
  const totalVisitors = visitorRows.reduce((sum, row) => sum + Number(row.total_guests || 0), 0);
  const totalRooms = accommodationRows.reduce((sum, row) => sum + Number(row.total_rooms || 0), 0);
  const totalOccupied = accommodationRows.reduce((sum, row) => sum + Number(row.total_occupied_rooms || 0), 0);
  const originTotals = visitorRows.reduce((totals, row) => {
    const label = String(row.place_of_residence || row.residence_type || 'Unknown').trim() || 'Unknown';
    totals[label] = (totals[label] || 0) + Number(row.total_guests || 0);
    return totals;
  }, {});
  const establishmentTotals = visitorRows.reduce((totals, row) => {
    const id = String(row.establishment_id || 'unknown');
    const current = totals[id] || { establishment_id: id, name: row.establishments?.name || 'Unknown establishment', visitors: 0 };
    current.visitors += Number(row.total_guests || 0);
    totals[id] = current;
    return totals;
  }, {});
  const originEvidence = Object.entries(originTotals).map(([origin, visitors]) => ({ origin, visitors })).sort((a, b) => b.visitors - a.visitors).slice(0, 10);
  const establishmentEvidence = Object.values(establishmentTotals).sort((a, b) => b.visitors - a.visitors).slice(0, 10);
  return {
    visitors: visitorRows,
    accommodation: accommodationRows,
    totalVisitors,
    avgOccupancy: totalRooms > 0 ? (totalOccupied / totalRooms) * 100 : 0,
    monthlyMetrics,
    originEvidence,
    establishmentEvidence,
    analysisPeriod,
    establishmentName: scope === 'establishment' ? 'this establishment' : 'Balayan municipality',
  };
};


const generate = async (apiKey, data, scope) => {
  const anomalies = buildDeterministicAnomalies(data.monthlyMetrics);
  const evidenceCatalog = [
    ...data.monthlyMetrics.map((row) => ({ id: `monthly:${row.month}`, metric: 'monthly', period: row.month, evidence: row })),
    ...anomalies.map((item) => ({ id: item.evidence.anomaly_key, metric: item.evidence.metric, period: item.evidence.current_month, evidence: item.evidence })),
    ...data.originEvidence.map((item) => ({ id: `visitor-origin:${item.origin}`, metric: 'visitorOrigins', evidence: item })),
    ...data.establishmentEvidence.map((item) => ({ id: `establishment-performance:${item.establishment_id}`, metric: 'establishmentPerformance', evidence: item })),
  ];
  const allowedEvidenceIds = new Set(evidenceCatalog.map((item) => item.id));
  const monthlyCoverage = data.monthlyMetrics.map((row) => row.coveragePercent).filter((value) => value != null).reduce((minimum, value) => Math.min(minimum, value), 100);
  const accommodationCoverage = data.monthlyMetrics.map((row) => row.accommodationCoveragePercent).filter((value) => value != null).reduce((minimum, value) => Math.min(minimum, value), 100);
  const combinedCoverage = Math.min(monthlyCoverage, accommodationCoverage);
  const coverageByMetric = {
    dayTourVisitors: coverageConfidence(monthlyCoverage),
    overnightGuestCheckIns: coverageConfidence(accommodationCoverage),
    seasonality: coverageConfidence(combinedCoverage),
    visitorOrigins: coverageConfidence(monthlyCoverage),
    establishmentPerformance: coverageConfidence(monthlyCoverage),
  };
  const prompt = `You are a tourism data analyst for ${data.establishmentName}. This is a decision-support system for a municipal tourism officer. Based only on the verified aggregate values below, return one JSON object with 2 to 5 concise insights. For municipality scope, generate only evidence-supported domains: consolidate shared reporting completeness into one insight when needed, then add distinct diagnostic or conditional strategic insights for dayTourVisitors, overnightGuestCheckIns, seasonality, visitorOrigins, or establishmentPerformance; do not force every metric or spend multiple insights on the same reporting-compliance issue. Use this exact shape: {"insights":[{"title":"max 6 words","description":"one sentence max 30 words; describe only supplied evidence","impact":"high|medium|low","insight_category":"Reporting Compliance|Data Validation|Tourism Planning|Tourism Promotion|Accommodation Development|Resource Allocation|Comparative Tourism Assessment|Policy and Program Evaluation","metric":"dayTourVisitors|overnightGuestCheckIns|seasonality|visitorOrigins|establishmentPerformance","analysis_period":"selected period","geographic_scope":"Balayan municipality","data_confidence":"Very Low|Low|Moderate|High","data_limitations":["specific limitation"],"decision_implication":"why this matters for a municipal decision, max 35 words","recommended_actions":[{"action_title":"max 8 words","action_description":"specific action with an owner or target, max 28 words","action_priority":"Critical|High|Medium|Low","action_category":"Operations|Reporting Compliance|Tourism Planning|Tourism Promotion|Accommodation Development|Resource Allocation","responsible_entity":"suggested entity","suggested_timeframe":"Immediate|Within 7 days|Within 14 days|Within 30 days|Within 30–60 days|Before the anticipated peak season|During the next reporting period","supporting_evidence_ids":["evidence key"],"prerequisites":["required condition"],"success_indicators":["measurable result"],"validation_required":true}],"responsible_entities":["suggested entity"],"suggested_timeframe":"suggested timeframe","expected_outcome":"intended benefit, max 25 words","success_indicators":["measurable result"],"validation_required":true,"related_evidence_ids":["evidence key"]}]}. Each action must include primary_objective, recommendation_class (Data Validation, Diagnostic Assessment, Strategic Tourism Intervention, or Outcome Evaluation), a verified responsible entity, a timeframe, at least one measurable success indicator, supporting evidence IDs from the supplied evidence, and validation_required. Missing required fields make the action unusable and it must not be persisted. Generate 2 to 4 concrete actions per insight. Actions must help the officer decide what to do next: name a concrete operational step such as contacting responsible establishments, assigning follow-up, setting a completion deadline, coordinating a response, escalating a verified issue, or using a confirmed seasonal peak as a planning benchmark. Do not begin with or consist only of review, investigate, compare, monitor, validate, or study. State the evidence-supported decision purpose. For dayTourVisitors and overnightGuestCheckIns, use only supplied reported values, reporting coverage, missing reports, entered-after-report-date counts (never call these late without a configured deadline), and period-to-period changes. For seasonality, use only repeated monthly visitor or check-in patterns and the observed peak month; a single peak is only a potential seasonal pattern. Do not recommend promotions, campaigns, marketing, capacity, rooms, lodging expansion, occupancy changes, pricing, events, weather responses, or causes unless those exact values are supplied. Do not invent causes, figures, establishments, or personal data. Confidence must reflect coverage and limitations: below 25% is Very Low, 25% to below 50% Low, 50% to below 80% Moderate, and 80% or higher High. These are internal decision-support thresholds, not official standards. Do not reference any period, month, year, establishment, report type, or value outside the verified analysis context. Analysis context: ${JSON.stringify(data.analysisPeriod || { label: 'full available period' })}. Total submitted day-tour visitors: ${data.totalVisitors}. Average accommodation occupancy: ${data.avgOccupancy}%. Monthly metrics: ${JSON.stringify(data.monthlyMetrics)}. Verified anomaly evidence: ${JSON.stringify(anomalies.map((item) => item.evidence))}. Verified visitor-origin totals: ${JSON.stringify(data.originEvidence)}. Verified establishment visitor-volume totals: ${JSON.stringify(data.establishmentEvidence)}. Allowed evidence IDs: ${JSON.stringify([...allowedEvidenceIds])}. Use only these IDs.`;
  const result = await generateContentWithFallback(apiKey, prompt);
  const generated = jsonObject(await result.response.text());
  return {
    insights: deduplicateInsightActions(normalizeInsights(generated.insights, coverageByMetric, data.analysisPeriod, allowedEvidenceIds, data.monthlyMetrics)),
    anomalies,
    modelName: result.modelName,
  };
};

const findCachedResults = async (supabaseAdmin, scope, establishmentId, generationKey) => {
  const query = supabaseAdmin
    .from('ai_insights_cache')
    .select('data, expires_at')
    .contains('data', { generation_key: generationKey })
    .gt('expires_at', new Date().toISOString())
    .order('generated_at', { ascending: false })
    .limit(1);
  const scopedQuery = scope === 'establishment'
    ? query.eq('establishment_id', establishmentId)
    : query.is('establishment_id', null);
  const { data, error } = await scopedQuery.maybeSingle();
  if (error) throw new Error('Unable to load AI request status');
  return data?.data?.results || null;
};

const insertResults = async (supabaseAdmin, results, scope, establishmentId, requestId, generationKey, sourceFingerprint) => {
  const modelName = results.modelName || MODEL_NAMES[0];
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  if (results.insights.length) {
    let supersedeQuery = supabaseAdmin.from('ai_recommendations').update({ status: 'superseded' }).eq('status', 'active');
    supersedeQuery = scope === 'establishment' ? supersedeQuery.eq('establishment_id', establishmentId) : supersedeQuery.is('establishment_id', null);
    const { error: supersedeError } = await supersedeQuery;
    if (supersedeError) throw new Error('Unable to supersede stale recommendations');
    const rows = results.insights.map((item) => ({
      ...item,
      input_snapshot: { ...(item.input_snapshot || {}), generation_key: generationKey, source_fingerprint: sourceFingerprint },
      model_name: modelName,
      establishment_id: scope === 'establishment' ? establishmentId : null,
      status: 'active',
      expires_at: expiresAt,
    }));
    const { error } = await supabaseAdmin.from('ai_recommendations').insert(rows);
    if (error) throw new Error('Unable to save generated recommendations');
  }
  if (results.anomalies.length) {
    for (const item of results.anomalies) {
      const anomalyKey = item.evidence?.anomaly_key;
      if (anomalyKey) {
        let existingQuery = supabaseAdmin
          .from('ai_anomalies_cache')
          .select('id')
          .eq('status', 'active')
          .contains('input_snapshot', { anomaly_key: anomalyKey });
        existingQuery = scope === 'establishment'
          ? existingQuery.eq('establishment_id', establishmentId)
          : existingQuery.is('establishment_id', null);
        const { data: existing, error: existingError } = await existingQuery;
        if (existingError) throw existingError;
        const ids = (existing || []).map((row) => row.id).filter(Boolean);
        if (ids.length) {
          const { error: updateError } = await supabaseAdmin
            .from('ai_anomalies_cache')
            .update({ status: 'superseded', is_resolved: true })
            .in('id', ids);
          if (updateError) throw updateError;
        }
      }
    }
    const rows = results.anomalies.map((item) => {
      if (!hasConsistentAnomalyEvidence(item.evidence)) {
        throw new Error('Refusing to save inconsistent anomaly evidence');
      }
      return {
        anomaly_type: item.type,
        severity: item.severity,
        description: item.description,
        recommendation: item.recommendation,
        establishment_id: scope === 'establishment' ? establishmentId : null,
        model_name: 'deterministic-rule-v1',
        input_snapshot: item.evidence,
        status: 'active',
        is_resolved: false,
        detected_at: new Date().toISOString(),
      };
    });
    const { error } = await supabaseAdmin.from('ai_anomalies_cache').insert(rows);
    if (error) throw new Error('Unable to save generated anomalies');
  }
  const { error: cacheError } = await supabaseAdmin.from('ai_insights_cache').insert({ insight_type: 'recommendations', establishment_id: scope === 'establishment' ? establishmentId : null, data: { insights: results.insights, anomalies: results.anomalies, scope, request_id: requestId, generation_key: generationKey, source_fingerprint: sourceFingerprint, results }, generated_at: new Date().toISOString(), expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });
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
    if (profileError) return sendJson(res, 403, { error: 'Unable to verify account access' });

    let establishmentStatus = null;
    if (profile?.role === 'establishment_staff' && profile.establishment_id) {
      const { data: establishment, error: establishmentError } = await supabaseAdmin
        .from('establishments')
        .select('status')
        .eq('id', profile.establishment_id)
        .maybeSingle();
      if (establishmentError) return sendJson(res, 403, { error: 'Unable to verify establishment access' });
      establishmentStatus = establishment?.status || null;
    }

    if (!isOfficer(profile) && !isStaff(profile, establishmentStatus)) return sendJson(res, 403, { error: 'AI insights are not available for this account' });
    if (!rateLimit(userData.user.id)) return sendJson(res, 429, { error: 'Too many AI requests. Please try again later.' });
    const body = await readBody(req);
    const scope = body.scope === 'establishment' ? 'establishment' : body.scope === 'municipality' ? 'municipality' : null;
    const requestId = String(body.request_id || '').trim() || crypto.randomUUID();
    const analysisPeriod = normalizeAnalysisPeriod(body.analysis_period);
    if (!scope || (scope === 'municipality' && !isOfficer(profile)) || (scope === 'establishment' && !isStaff(profile, establishmentStatus))) return sendJson(res, 403, { error: 'You are not authorized for this AI scope' });
    if (requestId.length > 100) return sendJson(res, 400, { error: 'Invalid AI request identifier' });
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return sendJson(res, 503, { error: 'AI service is not configured' });
    const data = await getScopedData(supabaseAdmin, profile, scope, analysisPeriod);
    const sourceFingerprint = crypto.createHash('sha256').update(JSON.stringify({ monthlyMetrics: data.monthlyMetrics, originEvidence: data.originEvidence, establishmentEvidence: data.establishmentEvidence })).digest('hex');
    const generationKey = crypto.createHash('sha256').update(JSON.stringify({ ruleVersion: 'decision-support-v4', scope, establishmentId: profile.establishment_id || null, analysisPeriod, sourceFingerprint })).digest('hex');
    const cachedResults = await findCachedResults(supabaseAdmin, scope, profile.establishment_id, generationKey);
    if (cachedResults) return sendJson(res, 200, cachedResults);
    const results = await generate(apiKey, data, scope);
    await insertResults(supabaseAdmin, results, scope, profile.establishment_id, requestId, generationKey, sourceFingerprint);
    return sendJson(res, 200, results);
  } catch (error) {
    console.error('AI generation failed:', error instanceof Error ? error.message : 'unknown error');
    if (error?.statusCode === 503) return sendJson(res, 503, { error: 'The AI service is temporarily busy. Please try again in a moment.' });
    return sendJson(res, error?.statusCode || 500, { error: error?.statusCode === 400 ? error.message : 'AI generation failed. Please try again.' });
  }
}
