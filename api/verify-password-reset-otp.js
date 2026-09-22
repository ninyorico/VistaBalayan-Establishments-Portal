import {
  consumeOtp,
  enforceOtpRateLimit,
  findAuthUserByEmail,
  getSupabaseAdmin,
  normalizeEmail,
  readBody,
  requireMethod,
  sendJson,
} from './_utils/emailjs.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res)) return;

  try {
    const body = await readBody(req);
    const email = normalizeEmail(body.email);
    const code = String(body.otp || '').trim();
    const password = String(body.password || '');

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return sendJson(res, 400, { error: 'Enter a valid email address.' });
    }
    if (!/^\d{6}$/.test(code)) {
      return sendJson(res, 400, { error: 'Enter the 6-digit OTP.' });
    }
    if (password.length < 8) {
      return sendJson(res, 400, { error: 'Password must be at least 8 characters.' });
    }

    enforceOtpRateLimit(req, { email, purpose: 'password_reset', action: 'verify' });
    const supabaseAdmin = getSupabaseAdmin();
    await consumeOtp(supabaseAdmin, { email, purpose: 'password_reset', code });

    const user = await findAuthUserByEmail(supabaseAdmin, email);
    if (!user?.id) throw new Error('Account not found.');

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password,
    });

    if (updateError) throw updateError;

    return sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error('verify-password-reset-otp failed', error);
    return sendJson(res, error?.statusCode || 500, { error: error?.statusCode === 401 ? 'Invalid or expired OTP.' : 'Failed to reset password.' });
  }
}
