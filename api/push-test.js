import { readBody, requireMethod, sendJson } from './_utils/emailjs.js';
import { getAuthenticatedPushUser, sendPushToUser } from './_utils/push.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;
  try {
    const { supabaseAdmin, user } = await getAuthenticatedPushUser(req);
    const body = await readBody(req);
    const results = await sendPushToUser(supabaseAdmin, user.id, {
      title: 'VistaBalayan notifications enabled',
      body: 'This device can now receive VistaBalayan report reminders and updates.',
      url: body.role === 'municipal_officer' ? '/officer/report-monitoring' : '/staff/submission-history',
      notificationId: `push-test-${Date.now()}`,
      type: 'system',
    });
    return sendJson(res, 200, { ok: true, results: results.map(({ id, sent, statusCode }) => ({ id, sent, statusCode })) });
  } catch (error) {
    return sendJson(res, error?.statusCode || 500, { error: error?.statusCode ? error.message : 'Unable to send test notification.' });
  }
}
