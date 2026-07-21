// Registers the offline-caching / push service worker at startup and reloads
// the page once when a new version takes control.
//
// The SW (public/service-worker.js) calls skipWaiting() + clients.claim(), so a
// freshly-deployed SW activates and takes over open pages immediately. That
// fires `controllerchange` here, and we reload to pick up the new bundle — no
// manual "Unregister + Clear site data" needed anymore.
//
// Skipped in dev (vite-plugin-pwa doesn't emit the SW there and HMR already
// handles updates). Registration is idempotent with pushService.js, which
// registers the same URL on push opt-in.
export function registerServiceWorker() {
  if (import.meta.env.DEV) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  // Whether this page load was already under SW control. On a first-ever visit
  // there is no controller, so the initial claim must NOT trigger a reload
  // (that would be a pointless refresh flash). On return visits the controller
  // exists, so a later controllerchange means a genuine update → reload.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js', { scope: '/' })
      .then((registration) => {
        // Check for a new SW now and hourly while the app stays open.
        registration.update();
        setInterval(() => registration.update(), 60 * 60 * 1000);
      })
      .catch(() => {
        // Registration failures are non-fatal — the app still works online.
      });
  });
}
