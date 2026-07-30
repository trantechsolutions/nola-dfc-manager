import { describe, it, expect } from 'vitest';
import {
  MAX_ATTEMPTS,
  MAX_AGE_MS,
  BASE_BACKOFF_MS,
  MAX_BACKOFF_MS,
  backoffMs,
  makeOutboxEntry,
  isEntryDue,
  isExpired,
  isExhausted,
  isRetryableError,
  withFailedAttempt,
  dedupeEntries,
  partitionQueue,
} from '../../utils/outboxPolicy';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const NOW = 1_700_000_000_000;

const makeEntry = (overrides = {}) => ({
  id: 'entry-1',
  type: 'evaluation.saveScore',
  payload: { score: 4 },
  dedupeKey: null,
  attempts: 0,
  createdAt: NOW,
  nextAttemptAt: NOW,
  lastError: null,
  ...overrides,
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('backoffMs', () => {
  it('doubles per attempt', () => {
    expect(backoffMs(1)).toBe(BASE_BACKOFF_MS * 2);
    expect(backoffMs(2)).toBe(BASE_BACKOFF_MS * 4);
    expect(backoffMs(3)).toBe(BASE_BACKOFF_MS * 8);
  });

  it('caps at the ceiling', () => {
    expect(backoffMs(50)).toBe(MAX_BACKOFF_MS);
  });

  it('never overflows to Infinity on a corrupted attempt count', () => {
    expect(Number.isFinite(backoffMs(1e9))).toBe(true);
  });

  it('treats zero and invalid counts as the base delay', () => {
    expect(backoffMs(0)).toBe(BASE_BACKOFF_MS);
    expect(backoffMs(-3)).toBe(BASE_BACKOFF_MS);
    expect(backoffMs(NaN)).toBe(BASE_BACKOFF_MS);
    expect(backoffMs(undefined)).toBe(BASE_BACKOFF_MS);
  });
});

describe('makeOutboxEntry', () => {
  it('creates a due, unattempted entry', () => {
    const entry = makeOutboxEntry({ type: 'a.b', payload: { x: 1 }, now: NOW });

    expect(entry.type).toBe('a.b');
    expect(entry.payload).toEqual({ x: 1 });
    expect(entry.attempts).toBe(0);
    expect(entry.createdAt).toBe(NOW);
    expect(entry.nextAttemptAt).toBe(NOW);
    expect(entry.id).toBeTruthy();
  });

  it('generates distinct ids for entries created in the same millisecond', () => {
    const a = makeOutboxEntry({ type: 'a.b', now: NOW });
    const b = makeOutboxEntry({ type: 'a.b', now: NOW });
    expect(a.id).not.toBe(b.id);
  });

  it('rejects an entry with no type — it could never be replayed', () => {
    expect(() => makeOutboxEntry({ payload: {} })).toThrow(/type/i);
    expect(() => makeOutboxEntry({ type: '' })).toThrow(/type/i);
  });
});

describe('isEntryDue', () => {
  it('is true once the backoff has elapsed', () => {
    expect(isEntryDue(makeEntry({ nextAttemptAt: NOW }), NOW)).toBe(true);
    expect(isEntryDue(makeEntry({ nextAttemptAt: NOW - 1 }), NOW)).toBe(true);
  });

  it('is false while still backing off', () => {
    expect(isEntryDue(makeEntry({ nextAttemptAt: NOW + 5000 }), NOW)).toBe(false);
  });

  it('is false for a missing entry', () => {
    expect(isEntryDue(null, NOW)).toBe(false);
  });
});

describe('isExpired / isExhausted', () => {
  it('expires entries past the max age', () => {
    expect(isExpired(makeEntry({ createdAt: NOW - MAX_AGE_MS }), NOW)).toBe(true);
    expect(isExpired(makeEntry({ createdAt: NOW - 1000 }), NOW)).toBe(false);
  });

  it('treats a missing entry as expired', () => {
    expect(isExpired(null, NOW)).toBe(true);
  });

  it('exhausts entries at the attempt ceiling', () => {
    expect(isExhausted(makeEntry({ attempts: MAX_ATTEMPTS }))).toBe(true);
    expect(isExhausted(makeEntry({ attempts: MAX_ATTEMPTS - 1 }))).toBe(false);
  });
});

describe('isRetryableError', () => {
  it('retries network failures with no status', () => {
    expect(isRetryableError(new TypeError('Failed to fetch'))).toBe(true);
  });

  it('retries 5xx', () => {
    expect(isRetryableError({ status: 500 })).toBe(true);
    expect(isRetryableError({ status: 503 })).toBe(true);
  });

  it('does not retry ordinary 4xx — replay would fail identically forever', () => {
    expect(isRetryableError({ status: 400 })).toBe(false);
    expect(isRetryableError({ status: 401 })).toBe(false);
    expect(isRetryableError({ status: 403 })).toBe(false);
    expect(isRetryableError({ status: 422 })).toBe(false);
  });

  it('retries timeout and rate-limit responses', () => {
    expect(isRetryableError({ status: 408 })).toBe(true);
    expect(isRetryableError({ status: 429 })).toBe(true);
  });

  it('reads the status off statusCode and code too', () => {
    expect(isRetryableError({ statusCode: 403 })).toBe(false);
    expect(isRetryableError({ code: 500 })).toBe(true);
  });

  it('is false for a missing error', () => {
    expect(isRetryableError(null)).toBe(false);
  });
});

describe('withFailedAttempt', () => {
  it('increments attempts and schedules the next try behind a backoff', () => {
    const next = withFailedAttempt(makeEntry(), new Error('boom'), NOW);

    expect(next.attempts).toBe(1);
    expect(next.nextAttemptAt).toBe(NOW + backoffMs(1));
    expect(next.lastError).toBe('boom');
  });

  it('does not mutate the original entry', () => {
    const entry = makeEntry();
    withFailedAttempt(entry, new Error('boom'), NOW);
    expect(entry.attempts).toBe(0);
  });

  it('truncates a runaway error message', () => {
    const next = withFailedAttempt(makeEntry(), new Error('x'.repeat(500)), NOW);
    expect(next.lastError.length).toBeLessThanOrEqual(200);
  });

  it('records a placeholder when the error has no message', () => {
    expect(withFailedAttempt(makeEntry(), {}, NOW).lastError).toBe('Unknown error');
  });
});

describe('dedupeEntries', () => {
  it('keeps only the newest entry per dedupe key', () => {
    const older = makeEntry({ id: 'a', dedupeKey: 'score:1', createdAt: NOW });
    const newer = makeEntry({ id: 'b', dedupeKey: 'score:1', createdAt: NOW + 10 });

    const result = dedupeEntries([older, newer]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('b');
  });

  it('keeps entries under different keys', () => {
    const result = dedupeEntries([
      makeEntry({ id: 'a', dedupeKey: 'score:1' }),
      makeEntry({ id: 'b', dedupeKey: 'score:2' }),
    ]);
    expect(result).toHaveLength(2);
  });

  it('never collapses entries without a dedupe key', () => {
    const result = dedupeEntries([makeEntry({ id: 'a' }), makeEntry({ id: 'b' })]);
    expect(result).toHaveLength(2);
  });

  it('returns entries in creation order', () => {
    const result = dedupeEntries([
      makeEntry({ id: 'late', createdAt: NOW + 100 }),
      makeEntry({ id: 'early', createdAt: NOW }),
    ]);
    expect(result.map((e) => e.id)).toEqual(['early', 'late']);
  });

  it('handles an empty queue', () => {
    expect(dedupeEntries([])).toEqual([]);
    expect(dedupeEntries()).toEqual([]);
  });
});

describe('partitionQueue', () => {
  it('routes a due entry to ready', () => {
    const { ready, drop, waiting } = partitionQueue([makeEntry()], NOW);

    expect(ready).toHaveLength(1);
    expect(drop).toHaveLength(0);
    expect(waiting).toHaveLength(0);
  });

  it('routes a backing-off entry to waiting', () => {
    const { ready, waiting } = partitionQueue([makeEntry({ nextAttemptAt: NOW + 60_000 })], NOW);

    expect(ready).toHaveLength(0);
    expect(waiting).toHaveLength(1);
  });

  it('drops expired entries', () => {
    const { drop } = partitionQueue([makeEntry({ createdAt: NOW - MAX_AGE_MS - 1 })], NOW);
    expect(drop).toHaveLength(1);
  });

  it('drops retry-exhausted entries', () => {
    const { drop } = partitionQueue([makeEntry({ attempts: MAX_ATTEMPTS })], NOW);
    expect(drop).toHaveLength(1);
  });

  it('drops an expired entry even while it is still backing off', () => {
    const { drop, waiting } = partitionQueue(
      [makeEntry({ createdAt: NOW - MAX_AGE_MS - 1, nextAttemptAt: NOW + 60_000 })],
      NOW,
    );
    expect(drop).toHaveLength(1);
    expect(waiting).toHaveLength(0);
  });

  it('dedupes before partitioning, so a superseded entry is not replayed', () => {
    const { ready } = partitionQueue(
      [
        makeEntry({ id: 'a', dedupeKey: 'score:1', createdAt: NOW }),
        makeEntry({ id: 'b', dedupeKey: 'score:1', createdAt: NOW + 5 }),
      ],
      NOW + 10,
    );

    expect(ready).toHaveLength(1);
    expect(ready[0].id).toBe('b');
  });

  it('honours custom limits', () => {
    const { drop } = partitionQueue([makeEntry({ attempts: 2 })], NOW, { maxAttempts: 2 });
    expect(drop).toHaveLength(1);
  });

  it('handles an empty queue', () => {
    expect(partitionQueue([], NOW)).toEqual({ ready: [], drop: [], waiting: [] });
  });
});
