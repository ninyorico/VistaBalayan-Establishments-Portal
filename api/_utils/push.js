import webpush from 'web-push';
import { getBearerToken, getSupabaseAdmin } from './emailjs.js';

const getRequiredEnv = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
};

export const configureWebPush = () => {
  webpush.setVapidDetails(
    getRequiredEnv('VAPID_SUBJECT'),
    getRequiredEnv('VAPID_PUBLIC_KEY'),
    getRequiredEnv('VAPID_PRIVATE_KEY'),
  );
};

export const getAuthenticatedPushUser = async (req) => {
  const token = getBearerToken(req);
  if (!token) {
    const error = new Error('Authentication required');
    error.statusCode = 401;
    throw error;
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user?.id) {
    const invalid = new Error('Invalid session');
    invalid.statusCode = 401;
    throw invalid;
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('id,role,status,establishment_id')
    .eq('id', data.user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile || profile.status !== 'active' || !['municipal_officer', 'establishment_staff'].includes(profile.role)) {
    const forbidden = new Error('Active portal account required');
    forbidden.statusCode = 403;
    throw forbidden;
  }

  return { supabaseAdmin, user: data.user, profile };
};

export const validateSubscription = (subscription) => {
  const endpoint = typeof subscription?.endpoint === 'string' ? subscription.endpoint.trim() : '';
  const p256dh = typeof subscription?.keys?.p256dh === 'string' ? subscription.keys.p256dh.trim() : '';
  const auth = typeof subscription?.keys?.auth === 'string' ? subscription.keys.auth.trim() : '';
  if (!endpoint || endpoint.length > 2048 || !p256dh || p256dh.length > 512 || !auth || auth.length > 512) {
    const invalid = new Error('Invalid push subscription');
    invalid.statusCode = 400;
    throw invalid;
  }
  return {
    endpoint,
    p256dh,
    auth,
    platform: typeof subscription.platform === 'string' ? subscription.platform.slice(0, 40) : null,
    user_agent: typeof subscription.userAgent === 'string' ? subscription.userAgent.slice(0, 500) : null,
  };
};

export const sendPushToUser = async (supabaseAdmin, userId, payload) => {
  configureWebPush();
  const { data: subscriptions, error } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id,endpoint,p256dh,auth')
    .eq('user_id', userId)
    .is('revoked_at', null);
  if (error) throw error;

  const results = await Promise.allSettled((subscriptions || []).map(async (row) => {
    try {
      await webpush.sendNotification({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } }, JSON.stringify(payload));
      await supabaseAdmin.from('push_subscriptions').update({ last_seen_at: new Date().toISOString() }).eq('id', row.id);
      return { id: row.id, sent: true };
    } catch (sendError) {
      const statusCode = Number(sendError?.statusCode || sendError?.statusCode);
      if (statusCode === 404 || statusCode === 410) {
        await supabaseAdmin.from('push_subscriptions').update({ revoked_at: new Date().toISOString() }).eq('id', row.id);
      }
      return { id: row.id, sent: false, statusCode };
    }
  }));

  return results.map((result) => result.status === 'fulfilled' ? result.value : { sent: false });
};
