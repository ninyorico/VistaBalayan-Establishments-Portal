import {
  consumeOtp,
  enforceOtpRateLimit,
  findAuthUserByEmail,
  getSupabaseAdmin,
  normalizeEmail,
  readBody,
  requireMethod,
  sendJson,
  verifyOfficerToken,
} from './_utils/emailjs.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res)) return;

  try {
    const body = await readBody(req);
    const email = normalizeEmail(body.email);
    const code = String(body.otp || '').trim();
    const password = String(body.password || '');
    const fullName = String(body.fullName || '').trim();

    if (!/^\S+@gmail\.com$/i.test(email)) {
      return sendJson(res, 400, { error: 'Use a valid Gmail address.' });
    }
    if (!/^\d{6}$/.test(code)) {
      return sendJson(res, 400, { error: 'Enter the 6-digit OTP.' });
    }
    if (password.length < 8) {
      return sendJson(res, 400, { error: 'Password must be at least 8 characters.' });
    }

    enforceOtpRateLimit(req, { email, purpose: 'staff_creation', action: 'verify' });
    const supabaseAdmin = getSupabaseAdmin();
    await verifyOfficerToken(req, supabaseAdmin);
    await consumeOtp(supabaseAdmin, { email, purpose: 'staff_creation', code });

    const existingAuthUser = await findAuthUserByEmail(supabaseAdmin, email);
    let userId = existingAuthUser?.id || null;

    if (userId) {
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password,
        email_confirm: true,
        user_metadata: {
          ...(existingAuthUser.user_metadata || {}),
          full_name: fullName,
          role: 'establishment_staff',
          status: 'active',
        },
      });
      if (updateError) throw updateError;
    } else {
      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          role: 'establishment_staff',
          status: 'active',
        },
      });
      if (createError) throw createError;
      userId = created.user?.id || null;
    }

    if (!userId) throw new Error('OTP verified but no user account was created.');

    return sendJson(res, 200, { ok: true, userId });
  } catch (error) {
    console.error('verify-staff-otp failed', error);
    return sendJson(res, error?.statusCode || 500, { error: error?.statusCode === 401 ? 'Invalid or expired OTP.' : 'Failed to verify OTP.' });
  }
}
