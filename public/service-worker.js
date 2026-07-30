/* global clients */
// Service Worker — handles push notifications + Workbox offline caching.
// vite-plugin-pwa (injectManifest strategy) injects `self.__WB_MANIFEST`
// at build time; at dev time the array is empty and precaching is a no-op.

import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { StaleWhileRevalidate, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import {
  SUPABASE_CACHE_NAME,
  STATIC_CACHE_NAME,
  isCacheableSupabaseRequest,
  buildPartitionedCacheKey,
} from '../src/utils/swCachePolicy';

// Precache all build artefacts (JS, CSS, HTML) injected by vite-plugin-pwa
precacheAndRoute(self.__WB_MANIFEST || []);

// ── Auto-update ───────────────────────────────────────────────────────────────
// Activate a freshly-installed SW immediately instead of waiting for every tab
// to close, and take control of open pages. Paired with the reload-on-update
// logic in src/registerSW.js, this ships new bundles without a manual cache
// clear. (Without this, a rebuilt SW stays in "waiting" and keeps serving the
// stale precache — the reason updated UI didn't reach the screen.)
self.skipWaiting();
self.addEventListener('activate', (event) => {
  event.waitUntil(
    // Drop supabase-rest-v1, whose entries were keyed by URL alone and are
    // therefore shared across users. Already-deployed clients carry these on
    // disk, so the upgrade has to delete them rather than just stop writing.
    caches
      .delete('supabase-rest-v1')
      .catch(() => {})
      .then(() => self.clients.claim()),
  );
});

// StaleWhileRevalidate for Supabase REST reads — serves cached data instantly
// while silently refreshing in the background. Only GET requests are cached, and
// medical_forms / guardians are excluded outright (see swCachePolicy).
//
// Responses are RLS-filtered per user but Cache Storage is shared across the
// whole browser profile, so every entry is partitioned by the JWT subject on the
// request. Without this, a second user signing in on the same device is served
// the first user's rows from cache.
registerRoute(
  ({ url, request }) => isCacheableSupabaseRequest(url, request.method),
  new StaleWhileRevalidate({
    cacheName: SUPABASE_CACHE_NAME,
    plugins: [
      {
        cacheKeyWillBeUsed: async ({ request }) =>
          buildPartitionedCacheKey(request.url, request.headers.get('authorization')),
      },
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
    cacheName: STATIC_CACHE_NAME,
    plugins: [
      new ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
      }),
    ],
  }),
);

// ── Sign-out purge ────────────────────────────────────────────────────────────
// Partitioning stops one user from reading another's cached rows, but the
// previous user's entries still sit on disk after they sign out. On a shared
// device that is the data at rest we care about, so the app posts PURGE_DATA_
// CACHES on SIGNED_OUT and we drop every non-precache cache. The Workbox
// precache is left alone — it holds only public build artefacts, and clearing it
// would force a full re-download on the next sign-in.
async function purgeDataCaches() {
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name === SUPABASE_CACHE_NAME || name === STATIC_CACHE_NAME)
      .map((name) => caches.delete(name)),
  );
}

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'PURGE_DATA_CACHES') return;
  event.waitUntil(
    purgeDataCaches().then(() => {
      // Let the caller know the disk is clean — the app awaits this before it
      // finishes tearing down the session.
      event.ports?.[0]?.postMessage({ type: 'PURGE_DATA_CACHES_DONE' });
    }),
  );
});

// ── Push Notifications ────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Cantera', body: event.data.text(), url: '/' };
  }

  const { title = 'Cantera', body = '', url = '/', icon, badge } = payload;

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
