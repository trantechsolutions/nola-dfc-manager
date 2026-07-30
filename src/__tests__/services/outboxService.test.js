import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createOutbox, createMemoryDriver } from '../../services/outboxService';
import { MAX_ATTEMPTS, MAX_AGE_MS, backoffMs } from '../../utils/outboxPolicy';

// ── Harness ───────────────────────────────────────────────────────────────────

// enqueue() stamps entries with the real Date.now(), so the flush clock has to
// sit just after it — a fixed past constant would leave every entry backing off.
let NOW;
let driver;

beforeEach(() => {
  driver = createMemoryDriver();
  NOW = Date.now() + 10;
});

/** Builds an outbox over the shared in-memory driver. */
const makeOutbox = (handlers = {}, onChange = null) => createOutbox({ driver, handlers, onChange });

/** An error carrying an HTTP status, as Supabase surfaces one. */
const httpError = (status) => Object.assign(new Error(`HTTP ${status}`), { status });

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('enqueue', () => {
  it('persists an entry and reports the pending count', async () => {
    const box = makeOutbox();

    await box.enqueue({ type: 'a.b', payload: { x: 1 } });

    expect(await box.count()).toBe(1);
    const [entry] = await box.list();
    expect(entry.type).toBe('a.b');
    expect(entry.payload).toEqual({ x: 1 });
  });

  it('notifies the change listener with the new count', async () => {
    const onChange = vi.fn();
    const box = makeOutbox({}, onChange);

    await box.enqueue({ type: 'a.b' });

    expect(onChange).toHaveBeenCalledWith(1);
  });

  it('survives a listener that throws', async () => {
    const box = makeOutbox({}, () => {
      throw new Error('listener blew up');
    });

    await expect(box.enqueue({ type: 'a.b' })).resolves.toBeTruthy();
    expect(await box.count()).toBe(1);
  });
});

describe('flush', () => {
  it('replays a due entry through its handler and removes it', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const box = makeOutbox({ 'a.b': handler });
    await box.enqueue({ type: 'a.b', payload: { x: 1 } });

    const result = await box.flush({ now: NOW });

    expect(handler).toHaveBeenCalledWith({ x: 1 });
    expect(result.replayed).toBe(1);
    expect(await box.count()).toBe(0);
  });

  it('replays entries in creation order', async () => {
    const seen = [];
    const box = makeOutbox({ 'a.b': async (p) => void seen.push(p.n) });

    await box.enqueue({ type: 'a.b', payload: { n: 1 } });
    await box.enqueue({ type: 'a.b', payload: { n: 2 } });
    await box.flush({ now: NOW });

    expect(seen).toEqual([1, 2]);
  });

  it('reschedules a retryable failure behind a backoff instead of dropping it', async () => {
    const box = makeOutbox({
      'a.b': vi.fn().mockRejectedValue(httpError(500)),
    });
    await box.enqueue({ type: 'a.b' });

    const result = await box.flush({ now: NOW });

    expect(result.failed).toBe(1);
    const [entry] = await box.list();
    expect(entry.attempts).toBe(1);
    expect(entry.nextAttemptAt).toBe(NOW + backoffMs(1));
  });

  it('drops a non-retryable 4xx rather than retrying forever', async () => {
    const box = makeOutbox({ 'a.b': vi.fn().mockRejectedValue(httpError(400)) });
    await box.enqueue({ type: 'a.b' });

    const result = await box.flush({ now: NOW });

    expect(result.dropped).toBe(1);
    expect(await box.count()).toBe(0);
  });

  it('does not replay an entry that is still backing off', async () => {
    const handler = vi.fn().mockRejectedValue(httpError(500));
    const box = makeOutbox({ 'a.b': handler });
    await box.enqueue({ type: 'a.b' });

    await box.flush({ now: NOW });
    await box.flush({ now: NOW + 1 });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('retries once the backoff has elapsed', async () => {
    const handler = vi.fn().mockRejectedValue(httpError(500));
    const box = makeOutbox({ 'a.b': handler });
    await box.enqueue({ type: 'a.b' });

    await box.flush({ now: NOW });
    await box.flush({ now: NOW + backoffMs(1) });

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('gives up after the attempt ceiling', async () => {
    const handler = vi.fn().mockRejectedValue(httpError(500));
    const box = makeOutbox({ 'a.b': handler });
    await box.enqueue({ type: 'a.b' });

    let clock = NOW;
    for (let i = 0; i < MAX_ATTEMPTS + 1; i++) {
      await box.flush({ now: clock });
      clock += backoffMs(MAX_ATTEMPTS) + 1;
    }

    expect(handler).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    expect(await box.count()).toBe(0);
  });

  it('drops an entry whose handler is no longer registered', async () => {
    const box = makeOutbox();
    await box.enqueue({ type: 'removed.in.a.later.build' });

    const result = await box.flush({ now: NOW });

    expect(result.dropped).toBe(1);
    expect(await box.count()).toBe(0);
  });

  it('drops entries that have expired unreplayed', async () => {
    const handler = vi.fn();
    const box = makeOutbox({ 'a.b': handler });
    await box.enqueue({ type: 'a.b' });

    const result = await box.flush({ now: NOW + MAX_AGE_MS + 1 });

    expect(handler).not.toHaveBeenCalled();
    expect(result.dropped).toBe(1);
    expect(await box.count()).toBe(0);
  });

  it('replays a deduped write once and clears the superseded entry', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const box = makeOutbox({ 'a.b': handler });

    await box.enqueue({ type: 'a.b', payload: { score: 3 }, dedupeKey: 'score:1' });
    await box.enqueue({ type: 'a.b', payload: { score: 5 }, dedupeKey: 'score:1' });

    const result = await box.flush({ now: NOW });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ score: 5 });
    expect(result.replayed).toBe(1);
    expect(await box.count()).toBe(0);
  });

  it('ignores a re-entrant flush so a mutation is never applied twice', async () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const handler = vi.fn().mockImplementation(() => gate);
    const box = makeOutbox({ 'a.b': handler });
    await box.enqueue({ type: 'a.b' });

    const first = box.flush({ now: NOW });
    const second = await box.flush({ now: NOW });

    expect(second.skipped).toBe(true);
    release();
    await first;
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('allows a later flush after an in-flight one settles', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const box = makeOutbox({ 'a.b': handler });

    await box.enqueue({ type: 'a.b' });
    await box.flush({ now: NOW });
    await box.enqueue({ type: 'a.b' });
    const result = await box.flush({ now: NOW });

    expect(result.skipped).toBe(false);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('is a no-op on an empty queue', async () => {
    const box = makeOutbox();
    await expect(box.flush({ now: NOW })).resolves.toEqual({
      replayed: 0,
      failed: 0,
      dropped: 0,
      skipped: false,
    });
  });
});

describe('register / clear', () => {
  it('replays through a handler registered after construction', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const box = makeOutbox();
    box.register('a.b', handler);

    await box.enqueue({ type: 'a.b' });
    await box.flush({ now: NOW });

    expect(handler).toHaveBeenCalled();
  });

  it('empties the queue', async () => {
    const box = makeOutbox();
    await box.enqueue({ type: 'a.b' });

    await box.clear();

    expect(await box.count()).toBe(0);
  });
});

describe('driver failures', () => {
  it('reports an empty queue when the store cannot be read', async () => {
    const box = createOutbox({
      driver: { ...createMemoryDriver(), getAll: vi.fn().mockRejectedValue(new Error('idb unavailable')) },
    });

    expect(await box.count()).toBe(0);
    expect(await box.list()).toEqual([]);
  });
});
