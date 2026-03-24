import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// ── Mock supabaseService before importing the hook ────────────────────────────
vi.mock('../../services/supabaseService', () => ({
  supabaseService: {
    getPlayerFinancials: vi.fn(),
    addTransaction: vi.fn(),
    updateTransaction: vi.fn(),
    deleteBatch: vi.fn(),
  },
}));

import { supabaseService } from '../../services/supabaseService';
import { useFinance } from '../../hooks/useFinance';

// ── Test data factories ───────────────────────────────────────────────────────

const SEASON = '2025-2026';
const TEAM_SEASON_ID = 'ts-uuid-001';

const makePlayer = (id, { feeWaived = false, buyIn = true } = {}) => ({
  id,
  seasonProfiles: {
    [SEASON]: { feeWaived, fundraiserBuyIn: buyIn },
  },
});

const makeFinancials = (remainingBalance) => ({ remainingBalance });

// Build a hook instance via renderHook (required for hooks that use useCallback)
const buildHook = (overrides = {}) => {
  const seasonalPlayers = overrides.players ?? [];
  const isBudgetLocked = overrides.locked ?? true;
  const playerFinancialsMap = overrides.financials ?? {};

  const { result } = renderHook(() =>
    useFinance(SEASON, seasonalPlayers, isBudgetLocked, TEAM_SEASON_ID, null, playerFinancialsMap),
  );

  return result.current;
};

// ── calculatePlayerFinancials ─────────────────────────────────────────────────
describe('calculatePlayerFinancials', () => {
  it('returns zeroed financials when no data in map', () => {
    const { calculatePlayerFinancials } = buildHook({ financials: {} });
    const result = calculatePlayerFinancials({ id: 'p1' }, []);
    expect(result.baseFee).toBe(0);
    expect(result.remainingBalance).toBe(0);
    expect(result.isWaived).toBe(false);
  });

  it('returns data from playerFinancialsMap when present', () => {
    const financials = {
      p1: { baseFee: 500, totalPaid: 200, remainingBalance: 300, isWaived: false, isFinalized: true },
    };
    const { calculatePlayerFinancials } = buildHook({ financials });
    const result = calculatePlayerFinancials({ id: 'p1' }, []);
    expect(result.baseFee).toBe(500);
    expect(result.totalPaid).toBe(200);
    expect(result.remainingBalance).toBe(300);
  });

  it('isDraft is true when budget not locked', () => {
    const { calculatePlayerFinancials } = buildHook({ locked: false, financials: {} });
    const result = calculatePlayerFinancials({ id: 'p1' }, []);
    expect(result.isDraft).toBe(true);
    expect(result.isFinalized).toBe(false);
  });

  it('isDraft is false when budget is locked', () => {
    const { calculatePlayerFinancials } = buildHook({ locked: true, financials: {} });
    const result = calculatePlayerFinancials({ id: 'p1' }, []);
    expect(result.isDraft).toBe(false);
    expect(result.isFinalized).toBe(true);
  });
});

// ── handleWaterfallCredit ─────────────────────────────────────────────────────
describe('handleWaterfallCredit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseService.addTransaction.mockResolvedValue({ id: 'new-tx' });
    supabaseService.updateTransaction.mockResolvedValue({});
  });

  it('throws if budget is not finalized', async () => {
    const { handleWaterfallCredit } = buildHook({ locked: false });
    await expect(handleWaterfallCredit(500, 'Test', null, 'orig-tx')).rejects.toThrow(
      'Budget must be finalized before distributing funds.',
    );
    expect(supabaseService.addTransaction).not.toHaveBeenCalled();
  });

  it('distributes full amount to one player when only one eligible', async () => {
    const p1 = makePlayer('p1');
    supabaseService.getPlayerFinancials.mockResolvedValue({ p1: makeFinancials(500) });

    const { handleWaterfallCredit } = buildHook({ players: [p1] });
    const batchId = await handleWaterfallCredit(300, 'Fundraiser', null, 'orig-tx');

    expect(batchId).toMatch(/^waterfall_/);
    const calls = supabaseService.addTransaction.mock.calls.map((c) => c[0]);
    const p1Tx = calls.find((c) => c.playerId === 'p1');
    expect(p1Tx).toBeDefined();
    expect(p1Tx.amount).toBe(300);
    expect(supabaseService.updateTransaction).toHaveBeenCalledWith('orig-tx', { distributed: true });
  });

  it('applies primary player cap then distributes remainder to pool', async () => {
    const p1 = makePlayer('p1'); // source player — balance 100
    const p2 = makePlayer('p2'); // pool — balance 200
    const p3 = makePlayer('p3'); // pool — balance 200

    supabaseService.getPlayerFinancials.mockResolvedValue({
      p1: makeFinancials(100),
      p2: makeFinancials(200),
      p3: makeFinancials(200),
    });

    const { handleWaterfallCredit } = buildHook({ players: [p1, p2, p3] });
    await handleWaterfallCredit(300, 'Sponsor', 'p1', 'orig-tx');

    const calls = supabaseService.addTransaction.mock.calls.map((c) => c[0]);

    // Primary player capped at their balance
    const p1Tx = calls.find((c) => c.playerId === 'p1');
    expect(p1Tx).toBeDefined();
    expect(p1Tx.amount).toBe(100);

    // Remaining 200 split between p2 and p3
    const p2Tx = calls.find((c) => c.playerId === 'p2');
    const p3Tx = calls.find((c) => c.playerId === 'p3');
    expect(p2Tx).toBeDefined();
    expect(p3Tx).toBeDefined();
    expect(p2Tx.amount + p3Tx.amount).toBeCloseTo(200, 1);
  });

  it('excludes fee-waived players from pool distribution', async () => {
    const p1 = makePlayer('p1');
    const p2 = makePlayer('p2', { feeWaived: true }); // should be excluded

    supabaseService.getPlayerFinancials.mockResolvedValue({
      p1: makeFinancials(300),
      p2: makeFinancials(300),
    });

    const { handleWaterfallCredit } = buildHook({ players: [p1, p2] });
    await handleWaterfallCredit(200, 'Fundraiser', null, 'orig-tx');

    const calls = supabaseService.addTransaction.mock.calls.map((c) => c[0]);
    expect(calls.find((c) => c.playerId === 'p2')).toBeUndefined();

    const p1Tx = calls.find((c) => c.playerId === 'p1');
    expect(p1Tx).toBeDefined();
    expect(p1Tx.amount).toBe(200);
  });

  it('excludes players without fundraiser buy-in from pool', async () => {
    const p1 = makePlayer('p1');
    const p2 = makePlayer('p2', { buyIn: false }); // no buy-in → excluded

    supabaseService.getPlayerFinancials.mockResolvedValue({
      p1: makeFinancials(300),
      p2: makeFinancials(300),
    });

    const { handleWaterfallCredit } = buildHook({ players: [p1, p2] });
    await handleWaterfallCredit(100, 'Fundraiser', null, 'orig-tx');

    const calls = supabaseService.addTransaction.mock.calls.map((c) => c[0]);
    expect(calls.find((c) => c.playerId === 'p2')).toBeUndefined();
  });

  it('sends overflow to team pool when all player balances are satisfied', async () => {
    const p1 = makePlayer('p1');
    supabaseService.getPlayerFinancials.mockResolvedValue({
      p1: makeFinancials(50), // only owes 50 but we send 200
    });

    const { handleWaterfallCredit } = buildHook({ players: [p1] });
    await handleWaterfallCredit(200, 'Sponsor', null, 'orig-tx');

    const calls = supabaseService.addTransaction.mock.calls.map((c) => c[0]);

    const p1Tx = calls.find((c) => c.playerId === 'p1');
    expect(p1Tx?.amount).toBe(50);

    const poolTx = calls.find((c) => c.playerId === null);
    expect(poolTx).toBeDefined();
    expect(poolTx.amount).toBeCloseTo(150, 1);
    expect(poolTx.title).toContain('Team Pool Overflow');
  });

  it('sends entire amount to team pool when all balances are zero', async () => {
    const p1 = makePlayer('p1');
    supabaseService.getPlayerFinancials.mockResolvedValue({
      p1: makeFinancials(0),
    });

    const { handleWaterfallCredit } = buildHook({ players: [p1] });
    await handleWaterfallCredit(100, 'Extra Funds', null, 'orig-tx');

    const calls = supabaseService.addTransaction.mock.calls.map((c) => c[0]);
    const poolTx = calls.find((c) => c.playerId === null);
    expect(poolTx).toBeDefined();
    expect(poolTx.amount).toBeCloseTo(100, 1);
  });

  it('attaches correct metadata to all created transactions', async () => {
    const p1 = makePlayer('p1');
    supabaseService.getPlayerFinancials.mockResolvedValue({ p1: makeFinancials(100) });

    const { handleWaterfallCredit } = buildHook({ players: [p1] });
    const batchId = await handleWaterfallCredit(100, 'Gift Cards', null, 'original-123', 'FUN');

    const [txArgs] = supabaseService.addTransaction.mock.calls[0];
    expect(txArgs.seasonId).toBe(SEASON);
    expect(txArgs.teamSeasonId).toBe(TEAM_SEASON_ID);
    expect(txArgs.waterfallBatchId).toBe(batchId);
    expect(txArgs.originalTxId).toBe('original-123');
    expect(txArgs.category).toBe('FUN');
    expect(txArgs.cleared).toBe(true);
  });

  it('does not update originalTxId when none is provided', async () => {
    const p1 = makePlayer('p1');
    supabaseService.getPlayerFinancials.mockResolvedValue({ p1: makeFinancials(100) });

    const { handleWaterfallCredit } = buildHook({ players: [p1] });
    await handleWaterfallCredit(100, 'Manual Credit', null, null);

    expect(supabaseService.updateTransaction).not.toHaveBeenCalled();
  });
});

// ── revertWaterfall ───────────────────────────────────────────────────────────
describe('revertWaterfall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseService.deleteBatch.mockResolvedValue({});
    supabaseService.updateTransaction.mockResolvedValue({});
  });

  it('deletes the batch and resets the original transaction', async () => {
    const { revertWaterfall } = buildHook();
    await revertWaterfall('waterfall_123', 'orig-tx-id');

    expect(supabaseService.deleteBatch).toHaveBeenCalledWith('waterfallBatchId', 'waterfall_123');
    expect(supabaseService.updateTransaction).toHaveBeenCalledWith('orig-tx-id', { distributed: false });
  });

  it('skips updateTransaction when no originalTxId provided', async () => {
    const { revertWaterfall } = buildHook();
    await revertWaterfall('waterfall_123', null);

    expect(supabaseService.deleteBatch).toHaveBeenCalled();
    expect(supabaseService.updateTransaction).not.toHaveBeenCalled();
  });
});
