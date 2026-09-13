import {
  describeError,
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
    const password = String(body.password || '');
    const fullName = String(body.fullName || '').trim();

    if (!/^\S+@[^\s@]+\.[^\s@]+$/i.test(email)) {
      return sendJson(res, 400, { error: 'Use a valid work email address.' });
    }
    if (!fullName) {
      return sendJson(res, 400, { error: 'Full name is required.' });
    }
    if (password.length < 8) {
      return sendJson(res, 400, { error: 'Password must be at least 8 characters.' });
    }

    const supabaseAdmin = getSupabaseAdmin();
    await verifyOfficerToken(req, supabaseAdmin);

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
          gmail_verified: false,
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
          gmail_verified: false,
        },
      });
      if (createError) throw createError;
      userId = created.user?.id || null;
    }

    if (!userId) throw new Error('No user account was created.');

    return sendJson(res, 200, { ok: true, userId });
  } catch (error) {
    console.error('create-staff-account failed', error);
    return sendJson(res, 500, { error: describeError(error, 'Failed to create staff account.') });
  }
}
