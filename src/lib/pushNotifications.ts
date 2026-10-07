function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

export type PushSubscriptionPayload = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

export async function registerPushDevice(accessToken: string) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    throw new Error('This browser does not support device notifications.');
  }

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission was not granted.');

  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    || ("standalone" in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
  if (isIos && !isStandalone) {
    throw new Error('On iPhone or iPad, first add VistaBalayan to the Home Screen and open it there before enabling notifications.');
  }

  await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  const registration = await navigator.serviceWorker.ready;
  const configResponse = await fetch('/api/push?action=config', { cache: 'no-store' });
  if (!configResponse.ok) throw new Error('Push notifications are not configured on the server.');
  const { publicKey } = await configResponse.json() as { publicKey?: string };
  if (!publicKey) throw new Error('Push notifications are not configured on the server.');

  let existing = await registration.pushManager.getSubscription();
  let subscription = existing;
  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.toLowerCase() : '';
      if (message.includes('push service') || message.includes('application server key')) {
        throw new Error('The browser push service rejected this device. Refresh the page, confirm site notifications are allowed, and try again. On iPhone or iPad, use the Home Screen app.');
      }
      throw error;
    }
  }
  const json = subscription.toJSON();
  const payload: PushSubscriptionPayload = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: json.keys?.p256dh || '',
      auth: json.keys?.auth || '',
    },
  };
  const response = await fetch('/api/push?action=subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ subscription: { ...payload, platform: navigator.platform, userAgent: navigator.userAgent } }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Unable to save this device subscription.');
  }
  return subscription;
}

export async function sendPushTest(accessToken: string, role: 'municipal_officer' | 'establishment_staff') {
  const response = await fetch('/api/push?action=test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ role }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || 'Unable to send a test notification.');
  }
}
