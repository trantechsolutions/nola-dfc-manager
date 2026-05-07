/* global clients */
// Service Worker for Web Push Notifications
// Handles push events and notification click routing

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Team Manager', body: event.data.text(), url: '/' };
  }

  const { title = 'Team Manager', body = '', url = '/', icon, badge } = payload;

  const options = {
    body,
    icon: icon || '/android-chrome-192x192.png',
    badge: badge || '/favicon-32x32.png',
    data: { url },
    vibrate: [200, 100, 200],
    requireInteraction: false,
    tag: url, // collapse duplicate notifications for the same route
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Focus existing tab if open
      for (const client of windowClients) {
        const clientUrl = new URL(client.url);
        if (clientUrl.pathname === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open new tab
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    }),
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  // Resubscribe automatically when subscription expires
  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true })
      .then((newSubscription) => {
        // Post back to client so it can save to Supabase
        return self.clients.matchAll().then((clients) => {
          clients.forEach((client) =>
            client.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED', subscription: newSubscription.toJSON() }),
          );
        });
      })
      .catch(() => {
        // Subscription could not be renewed — user will be prompted again on next visit
      }),
  );
});
