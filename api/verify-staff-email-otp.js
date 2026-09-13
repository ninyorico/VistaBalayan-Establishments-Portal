import {
  consumeOtp,
  describeError,
  findAuthUserByEmail,
  getSupabaseAdmin,
  normalizeEmail,
  readBody,
  requireMethod,
  sendJson,
  getBearerToken,
} from './_utils/emailjs.js';

const getActiveStaffFromRequest = async (req, supabaseAdmin) => {
  const token = getBearerToken(req);
  if (!token) throw new Error('Missing staff session. Please sign in again.');

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user?.id) throw new Error('Invalid staff session. Please sign in again.');

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, role, status, email, full_name')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (profile?.role !== 'establishment_staff' || profile?.status !== 'active') {
    throw new Error('Only active establishment staff can verify work email addresses.');
  }

  return { user: userData.user, profile };
};

export default async function handler(req, res) {
  if (!requireMethod(req, res)) return;

  try {
    const body = await readBody(req);
    const email = normalizeEmail(body.email);
    const code = String(body.otp || '').trim();

    if (!/^\S+@[^\s@]+\.[^\s@]+$/i.test(email)) {
      return sendJson(res, 400, { error: 'Use a valid work email address.' });
    }
    if (!/^\d{6}$/.test(code)) {
      return sendJson(res, 400, { error: 'Enter the 6-digit OTP.' });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { user, profile } = await getActiveStaffFromRequest(req, supabaseAdmin);

    const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('email', email)
      .eq('status', 'active')
      .neq('id', user.id)
      .maybeSingle();

    if (existingProfileError) throw existingProfileError;
    if (existingProfile?.id) {
      return sendJson(res, 409, { error: 'Another active VistaBalayan account already uses this work email address.' });
    }

    const existingAuthUser = await findAuthUserByEmail(supabaseAdmin, email);
    if (existingAuthUser?.id && existingAuthUser.id !== user.id) {
      throw new Error('Another Supabase auth account already uses this work email address.');
    }

    const otpRow = await consumeOtp(supabaseAdmin, { email, purpose: 'staff_creation', code });
    if (otpRow.metadata?.flow !== 'email_verification' || otpRow.metadata?.userId !== user.id) {
      throw new Error('This OTP was not requested by the signed-in staff account.');
    }

    const verifiedAt = new Date().toISOString();
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      email,
      email_confirm: true,
      user_metadata: {
        ...(user.user_metadata || {}),
        full_name: profile.full_name || user.user_metadata?.full_name || '',
        role: 'establishment_staff',
        status: 'active',
        gmail_verified: true,
        gmail_verified_at: verifiedAt,
      },
    });
    if (authError) throw authError;

    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({ email, updated_at: verifiedAt })
      .eq('id', user.id);
    if (profileError) throw profileError;

    return sendJson(res, 200, { ok: true, email, verifiedAt });
  } catch (error) {
    console.error('verify-staff-email-otp failed', error);
    return sendJson(res, 500, { error: describeError(error, 'Failed to verify work email OTP.') });
  }
}
