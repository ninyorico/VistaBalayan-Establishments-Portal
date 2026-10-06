import { readBody, requireMethod, sendJson } from './_utils/emailjs.js';
import { getAuthenticatedPushUser, validateSubscription } from './_utils/push.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  try {
    const { supabaseAdmin, user } = await getAuthenticatedPushUser(req);
    const body = await readBody(req);
    const subscription = validateSubscription(body.subscription);
    const { error } = await supabaseAdmin.from('push_subscriptions').upsert({
      user_id: user.id,
      ...subscription,
      revoked_at: null,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: 'endpoint' });
    if (error) throw error;
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    return sendJson(res, error?.statusCode || 500, { error: error?.statusCode ? error.message : 'Unable to save push subscription.' });
  }
}
