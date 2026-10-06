self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'VistaBalayan notification', body: event.data?.text?.() || '' };
  }

  const title = payload.title || 'VistaBalayan notification';
  const options = {
    body: payload.body || 'You have a new VistaBalayan update.',
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: payload.notificationId || 'vistabalayan-notification',
    data: { url: payload.url || '/staff/submission-history', notificationId: payload.notificationId || '' },
    renotify: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/staff/submission-history', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => 'focus' in client);
      if (existing) {
        existing.navigate(targetUrl);
        return existing.focus();
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
