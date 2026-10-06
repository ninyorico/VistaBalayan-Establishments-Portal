import { readBody, requireMethod, sendJson } from './_utils/emailjs.js';
import { getAuthenticatedPushUser, validateSubscription } from './_utils/push.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  try {
    const { supabaseAdmin, user } = await getAuthenticatedPushUser(req);
    const body = await readBody(req);
    const subscription = validateSubscription(body.subscription);
    const { error } = await supabaseAdmin
      .from('push_subscriptions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('endpoint', subscription.endpoint);
    if (error) throw error;
    return sendJson(res, 200, { ok: true });
  } catch (error) {
    return sendJson(res, error?.statusCode || 500, { error: error?.statusCode ? error.message : 'Unable to revoke push subscription.' });
  }
}
