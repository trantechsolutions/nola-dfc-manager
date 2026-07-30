// Exercises the real IndexedDB driver against fake-indexeddb. The rest of the
// outbox suite runs on the in-memory driver, which cannot catch schema,
// transaction, or persistence-across-reopen mistakes.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createIndexedDbDriver, createOutbox } from '../../services/outboxService';

// ── Harness ───────────────────────────────────────────────────────────────────

const makeEntry = (overrides = {}) => ({
  id: 'entry-1',
  type: 'a.b',
  payload: { x: 1 },
  dedupeKey: null,
  attempts: 0,
  createdAt: Date.now(),
  nextAttemptAt: Date.now(),
  lastError: null,
  ...overrides,
});

let driver;

beforeEach(async () => {
  driver = createIndexedDbDriver();
  await driver.clear();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('IndexedDB driver', () => {
  it('starts empty', async () => {
    expect(await driver.getAll()).toEqual([]);
  });

  it('persists an entry and reads it back intact', async () => {
    const entry = makeEntry({ payload: { nested: { score: 5 } } });

    await driver.put(entry);

    const rows = await driver.getAll();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(entry);
  });

  it('upserts on the same id rather than duplicating', async () => {
    await driver.put(makeEntry({ attempts: 0 }));
    await driver.put(makeEntry({ attempts: 3 }));

    const rows = await driver.getAll();
    expect(rows).toHaveLength(1);
    expect(rows[0].attempts).toBe(3);
  });

  it('keeps entries with distinct ids separate', async () => {
    await driver.put(makeEntry({ id: 'a' }));
    await driver.put(makeEntry({ id: 'b' }));

    expect(await driver.getAll()).toHaveLength(2);
  });

  it('removes a single entry by id', async () => {
    await driver.put(makeEntry({ id: 'a' }));
    await driver.put(makeEntry({ id: 'b' }));

    await driver.remove('a');

    const rows = await driver.getAll();
    expect(rows.map((r) => r.id)).toEqual(['b']);
  });

  it('treats removing an unknown id as a no-op', async () => {
    await driver.put(makeEntry({ id: 'a' }));

    await expect(driver.remove('does-not-exist')).resolves.not.toThrow();
    expect(await driver.getAll()).toHaveLength(1);
  });

  it('empties the store', async () => {
    await driver.put(makeEntry({ id: 'a' }));
    await driver.put(makeEntry({ id: 'b' }));

    await driver.clear();

    expect(await driver.getAll()).toEqual([]);
  });

  it('survives the database being reopened — the queue outlives a reload', async () => {
    await driver.put(makeEntry({ id: 'persisted' }));

    // A fresh driver opens the database again, as a page reload would.
    const reopened = createIndexedDbDriver();

    const rows = await reopened.getAll();
    expect(rows.map((r) => r.id)).toEqual(['persisted']);
  });
});

describe('outbox over IndexedDB', () => {
  it('enqueues, replays, and drains end to end', async () => {
    const handler = vi.fn().mockResolvedValue(undefined);
    const box = createOutbox({ driver, handlers: { 'a.b': handler } });

    await box.enqueue({ type: 'a.b', payload: { score: 4 } });
    expect(await box.count()).toBe(1);

    const result = await box.flush({ now: Date.now() + 10 });

    expect(handler).toHaveBeenCalledWith({ score: 4 });
    expect(result.replayed).toBe(1);
    expect(await box.count()).toBe(0);
  });

  it('leaves a retryable failure durably queued for the next session', async () => {
    const box = createOutbox({
      driver,
      handlers: { 'a.b': vi.fn().mockRejectedValue(Object.assign(new Error('down'), { status: 503 })) },
    });

    await box.enqueue({ type: 'a.b', payload: { score: 4 } });
    await box.flush({ now: Date.now() + 10 });

    // Reopening the database must still show the failed entry with its attempt
    // recorded — this is the property the in-memory driver cannot prove.
    const reopened = createOutbox({ driver: createIndexedDbDriver() });
    const rows = await reopened.list();

    expect(rows).toHaveLength(1);
    expect(rows[0].attempts).toBe(1);
    expect(rows[0].payload).toEqual({ score: 4 });
  });
});
