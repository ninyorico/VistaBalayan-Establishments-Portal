import { readBody, requireMethod, sendJson } from './_utils/emailjs.js';
import { getAuthenticatedPushUser, sendPushToUser, validateSubscription } from './_utils/push.js';

const route = (req) => new URL(req.url || '/', 'https://vistabalayan.local').searchParams.get('action') || 'config';

export default async function handler(req, res) {
  const action = route(req);
  if (action === 'config') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: `Method ${req.method} not allowed` });
    const key = process.env.VAPID_PUBLIC_KEY;
    if (!key) return sendJson(res, 503, { error: 'Push notifications are not configured.' });
    return sendJson(res, 200, { publicKey: key });
  }

  if (!requireMethod(req, res, 'POST')) return;
  try {
    const { supabaseAdmin, user } = await getAuthenticatedPushUser(req);
    const body = await readBody(req);

    if (action === 'subscribe') {
      const subscription = validateSubscription(body.subscription);
      const { error } = await supabaseAdmin.from('push_subscriptions').upsert({
        user_id: user.id,
        ...subscription,
        revoked_at: null,
        last_seen_at: new Date().toISOString(),
      }, { onConflict: 'endpoint' });
      if (error) throw error;
      return sendJson(res, 200, { ok: true });
    }

    if (action === 'unsubscribe') {
      const subscription = validateSubscription(body.subscription);
      const { error } = await supabaseAdmin
        .from('push_subscriptions')
        .update({ revoked_at: new Date().toISOString() })
        .eq('user_id', user.id)
        .eq('endpoint', subscription.endpoint);
      if (error) throw error;
      return sendJson(res, 200, { ok: true });
    }

    if (action === 'test') {
      const results = await sendPushToUser(supabaseAdmin, user.id, {
        title: 'VistaBalayan notifications enabled',
        body: 'This device can now receive VistaBalayan report reminders and updates.',
        url: body.role === 'municipal_officer' ? '/officer/report-monitoring' : '/staff/submission-history',
        notificationId: `push-test-${Date.now()}`,
        type: 'system',
      });
      return sendJson(res, 200, { ok: true, results: results.map(({ id, sent, statusCode }) => ({ id, sent, statusCode })) });
    }

    return sendJson(res, 404, { error: 'Unknown push action' });
  } catch (error) {
    return sendJson(res, error?.statusCode || 500, { error: error?.statusCode ? error.message : 'Push notification request failed.' });
  }
}
