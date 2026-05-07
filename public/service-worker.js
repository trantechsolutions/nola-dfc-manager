/* global clients */
// Service Worker — handles push notifications + Workbox offline caching.
// vite-plugin-pwa (injectManifest strategy) injects `self.__WB_MANIFEST`
// at build time; at dev time the array is empty and precaching is a no-op.

import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

// Precache all build artefacts (JS, CSS, HTML) injected by vite-plugin-pwa
precacheAndRoute(self.__WB_MANIFEST || []);

// StaleWhileRevalidate for Supabase REST reads — serves cached data instantly
// while silently refreshing in the background. Only GET requests are cached.
registerRoute(
  ({ url, request }) =>
    url.hostname.endsWith('.supabase.co') && url.pathname.startsWith('/rest/') && request.method === 'GET',
  new StaleWhileRevalidate({
    cacheName: 'supabase-rest-v1',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 60 * 60 * 24, // 24 h
      }),
    ],
  }),
);

// CacheFirst for static assets from our own origin (fonts, icons)
registerRoute(
  ({ request }) => request.destination === 'font' || request.destination === 'image',
  new CacheFirst({
    cacheName: 'static-assets-v1',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
      }),
    ],
  }),
);

// ── Push Notifications ────────────────────────────────────────────────────────

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
    tag: url,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        const clientUrl = new URL(client.url);
        if (clientUrl.pathname === targetUrl && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    }),
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true })
      .then((newSubscription) => {
        return self.clients.matchAll().then((allClients) => {
          allClients.forEach((client) =>
            client.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED', subscription: newSubscription.toJSON() }),
          );
        });
      })
      .catch(() => {
        // Subscription could not be renewed — user will be prompted again on next visit
      }),
  );
});
