// Durable queue for mutations made while offline.
//
// Storage sits behind a driver so the replay logic can be tested without
// IndexedDB (jsdom has none). The IndexedDB driver is the default in the
// browser; an in-memory driver is used as a fallback where IDB is unavailable
// (private-mode quirks, older WebViews) so the app degrades to session-scoped
// queueing instead of losing the write outright.
//
// Handlers are registered by name rather than stored with the entry — functions
// cannot be persisted, and a name keeps queued work replayable across reloads
// and deploys.

import { makeOutboxEntry, partitionQueue, withFailedAttempt, isRetryableError } from '../utils/outboxPolicy';

const DB_NAME = 'cantera-outbox';
const DB_VERSION = 1;
const STORE_NAME = 'mutations';

// ── Drivers ───────────────────────────────────────────────────────────────────

export function createMemoryDriver() {
  const rows = new Map();
  return {
    async getAll() {
      return [...rows.values()];
    },
    async put(entry) {
      rows.set(entry.id, entry);
    },
    async remove(id) {
      rows.delete(id);
    },
    async clear() {
      rows.clear();
    },
  };
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runTransaction(mode, work) {
  return openDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const store = tx.objectStore(STORE_NAME);
        let result;
        try {
          result = work(store);
        } catch (e) {
          reject(e);
          return;
        }
        tx.oncomplete = () => {
          db.close();
          resolve(result?.result ?? result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

export function createIndexedDbDriver() {
  return {
    getAll: () => runTransaction('readonly', (store) => store.getAll()),
    put: (entry) => runTransaction('readwrite', (store) => store.put(entry)),
    remove: (id) => runTransaction('readwrite', (store) => store.delete(id)),
    clear: () => runTransaction('readwrite', (store) => store.clear()),
  };
}

function defaultDriver() {
  if (typeof indexedDB === 'undefined') return createMemoryDriver();
  try {
    return createIndexedDbDriver();
  } catch {
    return createMemoryDriver();
  }
}

// ── Queue ─────────────────────────────────────────────────────────────────────

export function createOutbox({ driver = defaultDriver(), handlers = {}, onChange = null } = {}) {
  const registry = new Map(Object.entries(handlers));
  let flushing = false;

  const notify = async () => {
    if (!onChange) return;
    try {
      onChange(await count());
    } catch {
      // A listener failure must never break the queue.
    }
  };

  async function count() {
    try {
      const entries = await driver.getAll();
      return entries.length;
    } catch {
      return 0;
    }
  }

  return {
    /** Registers a replay handler for a mutation type. */
    register(type, handler) {
      registry.set(type, handler);
    },

    /** Queues a mutation for later replay. */
    async enqueue({ type, payload, dedupeKey = null }) {
      const entry = makeOutboxEntry({ type, payload, dedupeKey });
      await driver.put(entry);
      await notify();
      return entry;
    },

    async count() {
      return count();
    },

    async list() {
      try {
        return await driver.getAll();
      } catch {
        return [];
      }
    },

    async clear() {
      await driver.clear();
      await notify();
    },

    /**
     * Replays every due entry. Successes and permanently-failed entries are
     * removed; retryable failures are rescheduled behind a backoff.
     *
     * Re-entrant calls are ignored — `online` and `visibilitychange` routinely
     * fire together, and replaying the same entry twice concurrently would
     * double-apply any non-idempotent mutation.
     */
    async flush({ now = Date.now() } = {}) {
      if (flushing) return { replayed: 0, failed: 0, dropped: 0, skipped: true };
      flushing = true;

      const result = { replayed: 0, failed: 0, dropped: 0, skipped: false };

      try {
        const entries = await this.list();
        const { ready, drop, waiting } = partitionQueue(entries, now);

        // Anything partitionQueue did not return was deduped away — a newer
        // entry supersedes it. Remove those alongside the expired and
        // retry-exhausted ones so the queue cannot grow unbounded.
        const retained = new Set([...ready, ...waiting].map((e) => e.id));
        const dropIds = new Set(drop.map((e) => e.id));
        for (const entry of entries) {
          if (!retained.has(entry.id)) dropIds.add(entry.id);
        }

        for (const id of dropIds) {
          await driver.remove(id);
          result.dropped += 1;
        }

        for (const entry of ready) {
          const handler = registry.get(entry.type);
          if (!handler) {
            // Nothing can replay this — most likely a stale entry from an older
            // build whose handler no longer exists.
            await driver.remove(entry.id);
            result.dropped += 1;
            continue;
          }

          try {
            await handler(entry.payload);
            await driver.remove(entry.id);
            result.replayed += 1;
          } catch (error) {
            if (isRetryableError(error)) {
              await driver.put(withFailedAttempt(entry, error, now));
              result.failed += 1;
            } else {
              await driver.remove(entry.id);
              result.dropped += 1;
            }
          }
        }
      } finally {
        flushing = false;
        await notify();
      }

      return result;
    },
  };
}

/** App-wide outbox instance. */
export const outbox = createOutbox();
