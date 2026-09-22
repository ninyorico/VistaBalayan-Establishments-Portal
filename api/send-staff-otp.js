import {
  enforceOtpRateLimit,
  generateOtp,
  getSupabaseAdmin,
  normalizeEmail,
  readBody,
  requireMethod,
  sendJson,
  sendOtpEmail,
  storeOtp,
  verifyOfficerToken,
} from './_utils/emailjs.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res)) return;

  try {
    const body = await readBody(req);
    const email = normalizeEmail(body.email);
    const fullName = String(body.fullName || '').trim();

    if (!/^\S+@[^\s@]+\.[^\s@]+$/i.test(email)) {
      return sendJson(res, 400, { error: 'Use a valid work email address.' });
    }
    if (!fullName) {
      return sendJson(res, 400, { error: 'Full name is required.' });
    }

    enforceOtpRateLimit(req, { email, purpose: 'staff_creation', action: 'send' });
    const supabaseAdmin = getSupabaseAdmin();
    const officer = await verifyOfficerToken(req, supabaseAdmin);

    const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
      .from('profiles')
      .select('id, status')
      .eq('email', email)
      .eq('status', 'active')
      .maybeSingle();

    if (existingProfileError) throw existingProfileError;
    if (existingProfile?.id) {
      return sendJson(res, 409, { error: 'An active VistaBalayan profile already exists for this work email address.' });
    }

    const code = generateOtp();
    await storeOtp(supabaseAdmin, {
      email,
      purpose: 'staff_creation',
      code,
      metadata: {
        fullName,
        requestedBy: officer.id,
      },
    });

    await sendOtpEmail({ to: email, code, purpose: 'staff_creation' });

    return sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error('send-staff-otp failed', error);
    return sendJson(res, error?.statusCode || 500, { error: error?.statusCode === 429 ? error.message : 'Failed to send OTP.' });
  }
}
