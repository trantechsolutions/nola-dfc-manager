// Queueing policy for the offline mutation outbox.
//
// Why this exists: the app is read-only when offline. A coach scoring players
// on a field with no signal, or a parent tapping save in a dead-zone parking
// lot, silently loses the write. The outbox queues those mutations durably and
// replays them on reconnect.
//
// iOS PWAs have no Background Sync API, so replay is driven by `online` and
// `visibilitychange` in the foreground — a queued entry does not sync until the
// user reopens the app. Entries therefore have to survive on disk and expire on
// their own rather than assuming a prompt flush.
//
// All decisions live here as pure functions so the retry, expiry, and dedupe
// rules are testable without touching IndexedDB.

/** Give up on an entry after this many failed replays. */
export const MAX_ATTEMPTS = 5;

/** Entries older than this are dropped unreplayed — stale writes do more harm than good. */
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** First retry delay; doubles per attempt. */
export const BASE_BACKOFF_MS = 1000;

/** Ceiling on the exponential backoff. */
export const MAX_BACKOFF_MS = 5 * 60 * 1000;

/**
 * Exponential backoff for a given attempt count, capped. Keeps a persistently
 * failing entry from hammering the API every time the tab regains focus.
 */
export function backoffMs(attempts, { base = BASE_BACKOFF_MS, cap = MAX_BACKOFF_MS } = {}) {
  const n = Number.isFinite(attempts) && attempts > 0 ? Math.floor(attempts) : 0;
  // Bound the exponent before the shift so a corrupted attempts value cannot
  // overflow into Infinity.
  const scaled = base * 2 ** Math.min(n, 30);
  return Math.min(scaled, cap);
}

/**
 * Builds a queue entry. `dedupeKey` identifies the logical target of the write
 * so repeated edits to the same field collapse — see dedupeEntries.
 */
export function makeOutboxEntry({ type, payload, dedupeKey = null, now = Date.now() } = {}) {
  if (!type || typeof type !== 'string') {
    throw new Error('Outbox entry requires a type');
  }
  return {
    id: `${now}-${Math.random().toString(36).slice(2, 10)}`,
    type,
    payload: payload ?? null,
    dedupeKey,
    attempts: 0,
    createdAt: now,
    nextAttemptAt: now,
    lastError: null,
  };
}

/** True when an entry's backoff has elapsed and it is eligible for replay. */
export function isEntryDue(entry, now = Date.now()) {
  if (!entry) return false;
  return (entry.nextAttemptAt ?? 0) <= now;
}

/** True when an entry has sat in the queue past its useful life. */
export function isExpired(entry, now = Date.now(), maxAgeMs = MAX_AGE_MS) {
  if (!entry) return true;
  return now - (entry.createdAt ?? 0) >= maxAgeMs;
}

/** True when an entry has burned through its retry budget. */
export function isExhausted(entry, maxAttempts = MAX_ATTEMPTS) {
  if (!entry) return true;
  return (entry.attempts ?? 0) >= maxAttempts;
}

/**
 * Whether a failed request is worth retrying. Network and 5xx failures are
 * transient; a 4xx means the request itself is wrong and replaying it will fail
 * identically forever, so it is dropped rather than retried.
 */
export function isRetryableError(error) {
  if (!error) return false;

  const status = error.status ?? error.statusCode ?? error.code;
  if (typeof status === 'number') {
    if (status >= 400 && status < 500) return status === 408 || status === 429;
    return true;
  }

  // Supabase surfaces offline failures as a TypeError from fetch.
  return true;
}

/** Records a failed attempt, scheduling the next one behind a backoff. */
export function withFailedAttempt(entry, error, now = Date.now()) {
  const attempts = (entry.attempts ?? 0) + 1;
  return {
    ...entry,
    attempts,
    nextAttemptAt: now + backoffMs(attempts),
    lastError: error?.message ? String(error.message).slice(0, 200) : 'Unknown error',
  };
}

/**
 * Collapses entries that target the same logical write, keeping the newest.
 * A coach nudging one score five times offline should replay once, not five
 * times — and replaying the older values would briefly resurrect stale data.
 * Entries without a dedupeKey are always kept.
 */
export function dedupeEntries(entries = []) {
  const byKey = new Map();
  const kept = [];

  for (const entry of entries) {
    if (!entry?.dedupeKey) {
      kept.push(entry);
      continue;
    }
    const existing = byKey.get(entry.dedupeKey);
    if (!existing || (entry.createdAt ?? 0) >= (existing.createdAt ?? 0)) {
      byKey.set(entry.dedupeKey, entry);
    }
  }

  return [...kept, ...byKey.values()].sort((a, b) => (a?.createdAt ?? 0) - (b?.createdAt ?? 0));
}

/**
 * Splits the queue into what to replay now and what to discard. Expired and
 * retry-exhausted entries are dropped; the rest wait for their backoff.
 */
export function partitionQueue(entries = [], now = Date.now(), options = {}) {
  const { maxAttempts = MAX_ATTEMPTS, maxAgeMs = MAX_AGE_MS } = options;
  const ready = [];
  const drop = [];
  const waiting = [];

  for (const entry of dedupeEntries(entries)) {
    if (!entry) continue;
    if (isExpired(entry, now, maxAgeMs) || isExhausted(entry, maxAttempts)) {
      drop.push(entry);
    } else if (isEntryDue(entry, now)) {
      ready.push(entry);
    } else {
      waiting.push(entry);
    }
  }

  return { ready, drop, waiting };
}
