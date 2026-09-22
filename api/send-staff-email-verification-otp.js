import {
  describeError,
  enforceOtpRateLimit,
  generateOtp,
  getSupabaseAdmin,
  normalizeEmail,
  readBody,
  requireMethod,
  sendJson,
  sendOtpEmail,
  storeOtp,
  getBearerToken,
} from './_utils/emailjs.js';

const getActiveStaffFromRequest = async (req, supabaseAdmin) => {
  const token = getBearerToken(req);
  if (!token) throw new Error('Missing staff session. Please sign in again.');

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user?.id) throw new Error('Invalid staff session. Please sign in again.');

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id, role, status, email')
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

    if (!/^\S+@[^\s@]+\.[^\s@]+$/i.test(email)) {
      return sendJson(res, 400, { error: 'Use a valid work email address.' });
    }

    enforceOtpRateLimit(req, { email, purpose: 'email_verification', action: 'send' });
    const supabaseAdmin = getSupabaseAdmin();
    const { user } = await getActiveStaffFromRequest(req, supabaseAdmin);

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

    const code = generateOtp();
    await storeOtp(supabaseAdmin, {
      email,
      purpose: 'email_verification',
      code,
      metadata: {
        flow: 'email_verification',
        userId: user.id,
        previousEmail: user.email || '',
      },
    });

    await sendOtpEmail({ to: email, code, purpose: 'email_verification' });

    return sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error('send-staff-email-verification-otp failed', error);
    return sendJson(res, 500, { error: describeError(error, 'Failed to send work email verification OTP.') });
  }
}
