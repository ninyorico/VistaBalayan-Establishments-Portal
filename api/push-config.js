import { sendJson } from './_utils/emailjs.js';

export default function handler(req, res) {
  if (req.method !== 'GET') return sendJson(res, 405, { error: `Method ${req.method} not allowed` });
  const key = process.env.VAPID_PUBLIC_KEY;
  if (!key) return sendJson(res, 503, { error: 'Push notifications are not configured.' });
  return sendJson(res, 200, { publicKey: key });
}
