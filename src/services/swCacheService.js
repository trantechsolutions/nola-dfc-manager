// Client half of the service worker's cache-purge contract.
//
// Cached Supabase responses are partitioned per user (see utils/swCachePolicy),
// but a signed-out user's rows still sit in Cache Storage until something
// removes them. On a shared device that is exactly the data we do not want left
// behind, so sign-out asks the service worker to drop its data caches.

const PURGE_TIMEOUT_MS = 2000;

export const swCacheService = {
  /**
   * Asks the active service worker to delete its Supabase and static-asset
   * caches. Resolves once the worker confirms, or after a short timeout —
   * sign-out must never hang on this, and a missed purge is far less bad than
   * stranding the user on a half-torn-down session.
   */
  async purgeDataCaches() {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return false;

    const worker = navigator.serviceWorker.controller;
    if (!worker) return false;

    return new Promise((resolve) => {
      let settled = false;
      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      };

      const timer = setTimeout(() => finish(false), PURGE_TIMEOUT_MS);

      try {
        const channel = new MessageChannel();
        channel.port1.onmessage = (event) => finish(event.data?.type === 'PURGE_DATA_CACHES_DONE');
        worker.postMessage({ type: 'PURGE_DATA_CACHES' }, [channel.port2]);
      } catch {
        finish(false);
      }
    });
  },
};
