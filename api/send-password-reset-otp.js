import {
  enforceOtpRateLimit,
  findAuthUserByEmail,
  generateOtp,
  getSupabaseAdmin,
  normalizeEmail,
  readBody,
  requireMethod,
  sendJson,
  sendOtpEmail,
  storeOtp,
} from './_utils/emailjs.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res)) return;

  try {
    const body = await readBody(req);
    const email = normalizeEmail(body.email);

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return sendJson(res, 400, { error: 'Enter a valid email address.' });
    }

    enforceOtpRateLimit(req, { email, purpose: 'password_reset', action: 'send' });
    const supabaseAdmin = getSupabaseAdmin();
    const user = await findAuthUserByEmail(supabaseAdmin, email);

    // Return success for unknown emails so the endpoint cannot be used to enumerate accounts.
    if (user?.id) {
      const code = generateOtp();
      await storeOtp(supabaseAdmin, {
        email,
        purpose: 'password_reset',
        code,
        metadata: { userId: user.id },
      });
      await sendOtpEmail({ to: email, code, purpose: 'password_reset' });
    }

    return sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error('send-password-reset-otp failed', error);
    return sendJson(res, error?.statusCode || 500, { error: error?.statusCode === 429 ? error.message : 'Failed to send reset OTP.' });
  }
}
