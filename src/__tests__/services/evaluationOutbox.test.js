import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../services/outboxService', () => ({
  outbox: {
    enqueue: vi.fn().mockResolvedValue({}),
    register: vi.fn(),
  },
}));

// vitest.config.js loads src/__tests__/setup.js, which has no Supabase stub, so
// the client is mocked here rather than relying on a global.
vi.mock('../../supabase', () => ({
  supabase: { from: vi.fn() },
}));

import { outbox } from '../../services/outboxService';
import { supabase } from '../../supabase';
import { evaluationService, OUTBOX_SAVE_SCORE } from '../../services/evaluationService';

// ── Harness ───────────────────────────────────────────────────────────────────

const SCORE = {
  candidateId: 'cand-1',
  categoryId: 'cat-1',
  evaluatorId: 'eval-1',
  score: 4,
  notes: 'good first touch',
};

const originalOnLine = Object.getOwnPropertyDescriptor(window.Navigator.prototype, 'onLine');

function setOnline(value) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

let upsert;

beforeEach(() => {
  vi.clearAllMocks();
  upsert = vi.fn().mockResolvedValue({ error: null });
  supabase.from.mockReturnValue({ upsert });
  setOnline(true);
});

afterEach(() => {
  if (originalOnLine) Object.defineProperty(window.Navigator.prototype, 'onLine', originalOnLine);
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('saveScore', () => {
  it('writes straight through when online', async () => {
    const result = await evaluationService.saveScore(SCORE);

    expect(upsert).toHaveBeenCalled();
    expect(outbox.enqueue).not.toHaveBeenCalled();
    expect(result).toEqual({ queued: false });
  });

  it('queues instead of writing when offline', async () => {
    setOnline(false);

    const result = await evaluationService.saveScore(SCORE);

    expect(upsert).not.toHaveBeenCalled();
    expect(result).toEqual({ queued: true });
    expect(outbox.enqueue).toHaveBeenCalledWith({
      type: OUTBOX_SAVE_SCORE,
      payload: SCORE,
      dedupeKey: `${OUTBOX_SAVE_SCORE}:cand-1:cat-1:eval-1`,
    });
  });

  it('scopes the dedupe key to candidate, category, and evaluator', async () => {
    setOnline(false);

    await evaluationService.saveScore(SCORE);
    await evaluationService.saveScore({ ...SCORE, evaluatorId: 'eval-2' });

    const [first, second] = outbox.enqueue.mock.calls.map(([arg]) => arg.dedupeKey);
    expect(first).not.toBe(second);
  });

  it('propagates a write failure when online', async () => {
    upsert.mockResolvedValue({ error: new Error('rls denied') });

    await expect(evaluationService.saveScore(SCORE)).rejects.toThrow('rls denied');
  });
});

describe('saveBatchScores', () => {
  const BATCH = [
    { candidateId: 'cand-1', categoryId: 'cat-1', evaluatorId: 'eval-1', score: 4 },
    { candidateId: 'cand-1', categoryId: 'cat-2', evaluatorId: 'eval-1', score: 5 },
  ];

  it('writes the batch in one upsert when online', async () => {
    const result = await evaluationService.saveBatchScores(BATCH);

    expect(upsert).toHaveBeenCalledTimes(1);
    expect(outbox.enqueue).not.toHaveBeenCalled();
    expect(result).toEqual({ queued: false });
  });

  it('queues one entry per score when offline, so each dedupes independently', async () => {
    setOnline(false);

    const result = await evaluationService.saveBatchScores(BATCH);

    expect(upsert).not.toHaveBeenCalled();
    expect(result).toEqual({ queued: true });
    expect(outbox.enqueue).toHaveBeenCalledTimes(2);

    const keys = outbox.enqueue.mock.calls.map(([arg]) => arg.dedupeKey);
    expect(new Set(keys).size).toBe(2);
    expect(keys[0]).toBe(`${OUTBOX_SAVE_SCORE}:cand-1:cat-1:eval-1`);
  });

  it('queues nothing for an empty batch', async () => {
    setOnline(false);

    await evaluationService.saveBatchScores([]);

    expect(outbox.enqueue).not.toHaveBeenCalled();
  });
});
