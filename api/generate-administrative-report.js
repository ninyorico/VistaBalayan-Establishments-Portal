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

const normalizeAggregates = (input) => Object.fromEntries(PERIOD_TYPES.map((periodType) => [
  periodType,
  (Array.isArray(input?.[periodType]) ? input[periodType] : []).slice(0, 200).map((row) => ({
    period: clean(row?.period, 30),
    visitorTotal: Number.isFinite(Number(row?.visitorTotal)) ? Math.max(0, Number(row.visitorTotal)) : 0,
    reportCount: Number.isFinite(Number(row?.reportCount)) ? Math.max(0, Number(row.reportCount)) : 0,
    establishmentCount: Number.isFinite(Number(row?.establishmentCount)) ? Math.max(0, Number(row.establishmentCount)) : 0,
  })).filter((row) => row.period),
]));

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
    if (profile?.role !== 'municipal_officer' || profile?.status !== 'active') return sendJson(res, 403, { error: 'Only active municipal officers can generate administrative reports' });
    if (!allowRequest(userData.user.id)) return sendJson(res, 429, { error: 'Too many AI requests. Please try again later.' });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return sendJson(res, 503, { error: 'AI service is not configured' });
    const body = await readBody(req);
    const periodLabel = clean(body?.periodLabel, 160) || 'the selected period';
    const aggregates = normalizeAggregates(body?.aggregates);
    if (!PERIOD_TYPES.some((periodType) => aggregates[periodType].length > 0)) return sendJson(res, 400, { error: 'No submitted visitor data is available for this period.' });

    const prompt = `You are an administrative tourism reporting assistant. Create a concise report for ${periodLabel} from the supplied deterministic visitor aggregates. Return ONLY valid JSON with exactly these string fields: overview, weekly, monthly, quarterly, yearly, followUp. Each field must be 1 to 3 sentences. Include the supplied totals and period labels when useful. Do not invent values, trends, causes, comparisons, or recommendations unsupported by the aggregates. If a period has no rows, say that no submitted visitor data was available for that aggregation. Do not approve, reject, or evaluate individual establishments. Do not mention AI, prompts, hidden data, or report IDs.\n\nAggregates:\n${JSON.stringify(aggregates)}`;
    const result = await generateWithFallback(apiKey, prompt);
    const generated = parseJsonObject(await result.text);
    return sendJson(res, 200, {
      report: {
        overview: normalizeSection(generated.overview, `Aggregated submitted visitor data for ${periodLabel}.`),
        weekly: normalizeSection(generated.weekly, 'No weekly summary was returned.'),
        monthly: normalizeSection(generated.monthly, 'No monthly summary was returned.'),
        quarterly: normalizeSection(generated.quarterly, 'No quarterly summary was returned.'),
        yearly: normalizeSection(generated.yearly, 'No yearly summary was returned.'),
        followUp: normalizeSection(generated.followUp, 'Verify the displayed totals before official use.'),
      },
      model: result.modelName,
    });
  } catch (error) {
    console.error('Administrative AI report failed:', error instanceof Error ? error.message : 'unknown error');
    return sendJson(res, error?.statusCode || 500, { error: error?.statusCode === 503 ? 'The AI service is temporarily busy. Please try again later.' : 'AI report generation failed. Please try again.' });
  }
}
