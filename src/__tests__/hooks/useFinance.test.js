import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// ── Mock supabaseService before importing the hook ────────────────────────────
vi.mock('../../services/supabaseService', () => ({
  supabaseService: {
    getPlayerFinancials: vi.fn(),
    addTransaction: vi.fn(),
    updateTransaction: vi.fn(),
    deleteBatch: vi.fn(),
    getBatchTransactionIds: vi.fn(),
    deleteOrphanedDistributionCredits: vi.fn(),
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

  // A method override surfaces via currentSeasonData (the 5th arg), mirroring how
  // useSoccerYear feeds team_seasons.distribution_method into the hook.
  const currentSeasonData = overrides.method ? { distributionMethod: overrides.method } : null;

  const { result } = renderHook(() =>
    useFinance(SEASON, seasonalPlayers, isBudgetLocked, TEAM_SEASON_ID, currentSeasonData, playerFinancialsMap),
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

// ── distribution methods ──────────────────────────────────────────────────────
describe('handleWaterfallCredit — per-team methods', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseService.addTransaction.mockResolvedValue({ id: 'new-tx' });
    supabaseService.updateTransaction.mockResolvedValue({});
  });

  // DIRECT: only the linked player is credited; the rest goes to the team pot.
  it('direct: credits only the linked player, overflow to team pot', async () => {
    const p1 = makePlayer('p1'); // source — balance 100
    const p2 = makePlayer('p2'); // teammate — balance 200, should get nothing

    supabaseService.getPlayerFinancials.mockResolvedValue({
      p1: makeFinancials(100),
      p2: makeFinancials(200),
    });

    const { handleWaterfallCredit } = buildHook({ players: [p1, p2], method: 'direct' });
    await handleWaterfallCredit(300, 'Sponsor', 'p1', 'orig-tx');

    const calls = supabaseService.addTransaction.mock.calls.map((c) => c[0]);
    expect(calls.find((c) => c.playerId === 'p1')?.amount).toBe(100);
    expect(calls.find((c) => c.playerId === 'p2')).toBeUndefined();
    expect(calls.find((c) => c.playerId === null)?.amount).toBeCloseTo(200, 1);
  });

  it('direct: credits a named player who has no fundraiser buy-in', async () => {
    const p1 = makePlayer('p1', { buyIn: false });

    supabaseService.getPlayerFinancials.mockResolvedValue({ p1: makeFinancials(400) });

    const { handleWaterfallCredit } = buildHook({ players: [p1], method: 'direct' });
    await handleWaterfallCredit(300, 'Sponsor', 'p1', 'orig-tx');

    const calls = supabaseService.addTransaction.mock.calls.map((c) => c[0]);
    expect(calls.find((c) => c.playerId === 'p1')?.amount).toBe(300);
    expect(calls.find((c) => c.playerId === null)).toBeUndefined();
  });

  it('waterfall: credits a named player without buy-in before the pool', async () => {
    const p1 = makePlayer('p1', { buyIn: false }); // named source — balance 100
    const p2 = makePlayer('p2'); // pool — balance 500

    supabaseService.getPlayerFinancials.mockResolvedValue({
      p1: makeFinancials(100),
      p2: makeFinancials(500),
    });

    const { handleWaterfallCredit } = buildHook({ players: [p1, p2] });
    await handleWaterfallCredit(300, 'Sponsor', 'p1', 'orig-tx');

    const calls = supabaseService.addTransaction.mock.calls.map((c) => c[0]);
    expect(calls.find((c) => c.playerId === 'p1')?.amount).toBe(100);
    expect(calls.find((c) => c.playerId === 'p2')?.amount).toBeCloseTo(200, 1);
  });

  // EVEN_SPLIT: ignore the linked player's cap; split equally across the pool.
  it('even_split: splits equally and ignores the primary-player cap', async () => {
    const p1 = makePlayer('p1'); // passed as source but treated as a normal member
    const p2 = makePlayer('p2');

    supabaseService.getPlayerFinancials.mockResolvedValue({
      p1: makeFinancials(500),
      p2: makeFinancials(500),
    });

    const { handleWaterfallCredit } = buildHook({ players: [p1, p2], method: 'even_split' });
    await handleWaterfallCredit(200, 'Fundraiser', 'p1', 'orig-tx');

    const calls = supabaseService.addTransaction.mock.calls.map((c) => c[0]);
    // Source is NOT capped to its full balance — it gets an equal 100, not 200.
    expect(calls.find((c) => c.playerId === 'p1')?.amount).toBeCloseTo(100, 1);
    expect(calls.find((c) => c.playerId === 'p2')?.amount).toBeCloseTo(100, 1);
    expect(calls.find((c) => c.playerId === null)).toBeUndefined();
  });

  it('even_split: still excludes fee-waived and non-buy-in players', async () => {
    const p1 = makePlayer('p1');
    const p2 = makePlayer('p2', { feeWaived: true });
    const p3 = makePlayer('p3', { buyIn: false });

    supabaseService.getPlayerFinancials.mockResolvedValue({
      p1: makeFinancials(500),
      p2: makeFinancials(500),
      p3: makeFinancials(500),
    });

    const { handleWaterfallCredit } = buildHook({ players: [p1, p2, p3], method: 'even_split' });
    await handleWaterfallCredit(100, 'Fundraiser', '', 'orig-tx');

    const calls = supabaseService.addTransaction.mock.calls.map((c) => c[0]);
    expect(calls.find((c) => c.playerId === 'p2')).toBeUndefined();
    expect(calls.find((c) => c.playerId === 'p3')).toBeUndefined();
    expect(calls.find((c) => c.playerId === 'p1')?.amount).toBeCloseTo(100, 1);
  });

  // TEAM_POT: no player credit at all — everything lands in the pot.
  it('team_pot: sends the entire amount to the team pot, no player credit', async () => {
    const p1 = makePlayer('p1');

    supabaseService.getPlayerFinancials.mockResolvedValue({
      p1: makeFinancials(300), // player owes money but pot method ignores it
    });

    const { handleWaterfallCredit } = buildHook({ players: [p1], method: 'team_pot' });
    await handleWaterfallCredit(250, 'Sponsor', 'p1', 'orig-tx');

    const calls = supabaseService.addTransaction.mock.calls.map((c) => c[0]);
    expect(calls.find((c) => c.playerId === 'p1')).toBeUndefined();
    const poolTx = calls.find((c) => c.playerId === null);
    expect(poolTx?.amount).toBeCloseTo(250, 1);
    expect(poolTx.title).toContain('Team Pool Overflow');
  });

  // An explicit unknown/undefined method falls back to waterfall behavior.
  it('defaults to waterfall when method is unset', async () => {
    const p1 = makePlayer('p1'); // source — balance 100
    const p2 = makePlayer('p2'); // pool — balance 200

    supabaseService.getPlayerFinancials.mockResolvedValue({
      p1: makeFinancials(100),
      p2: makeFinancials(200),
    });

    const { handleWaterfallCredit } = buildHook({ players: [p1, p2] }); // no method → waterfall
    await handleWaterfallCredit(300, 'Sponsor', 'p1', 'orig-tx');

    const calls = supabaseService.addTransaction.mock.calls.map((c) => c[0]);
    expect(calls.find((c) => c.playerId === 'p1')?.amount).toBe(100);
    expect(calls.find((c) => c.playerId === 'p2')?.amount).toBeCloseTo(200, 1);
  });
});

// ── manual split (explicit per-player allocations) ────────────────────────────
describe('handleWaterfallCredit — manual allocations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseService.addTransaction.mockResolvedValue({ id: 'new-tx' });
    supabaseService.updateTransaction.mockResolvedValue({});
  });

  it('credits each listed player the exact amount entered', async () => {
    const p1 = makePlayer('p1');
    const p2 = makePlayer('p2');
    const p3 = makePlayer('p3');

    supabaseService.getPlayerFinancials.mockResolvedValue({
      p1: makeFinancials(500),
      p2: makeFinancials(500),
      p3: makeFinancials(500),
    });

    const { handleWaterfallCredit } = buildHook({ players: [p1, p2, p3] });
    await handleWaterfallCredit(300, 'Car Wash', '', 'orig-tx', 'FUN', [
      { playerId: 'p1', amount: 175 },
      { playerId: 'p3', amount: 125 },
    ]);

    const calls = supabaseService.addTransaction.mock.calls.map((c) => c[0]);
    expect(calls.find((c) => c.playerId === 'p1')?.amount).toBe(175);
    expect(calls.find((c) => c.playerId === 'p3')?.amount).toBe(125);
    expect(calls.find((c) => c.playerId === 'p2')).toBeUndefined();
    expect(calls.find((c) => c.playerId === null)).toBeUndefined();
    expect(supabaseService.updateTransaction).toHaveBeenCalledWith('orig-tx', { distributed: true });
  });

  it('overrides the season method entirely', async () => {
    const p1 = makePlayer('p1');
    const p2 = makePlayer('p2');

    supabaseService.getPlayerFinancials.mockResolvedValue({
      p1: makeFinancials(500),
      p2: makeFinancials(500),
    });

    // team_pot would normally send everything to the pot — allocations win.
    const { handleWaterfallCredit } = buildHook({ players: [p1, p2], method: 'team_pot' });
    await handleWaterfallCredit(100, 'Raffle', 'p1', 'orig-tx', 'FUN', [{ playerId: 'p2', amount: 100 }]);

    const calls = supabaseService.addTransaction.mock.calls.map((c) => c[0]);
    expect(calls.find((c) => c.playerId === 'p2')?.amount).toBe(100);
    expect(calls.find((c) => c.playerId === null)).toBeUndefined();
  });

  it('sends the unallocated remainder to the team pot', async () => {
    const p1 = makePlayer('p1');
    supabaseService.getPlayerFinancials.mockResolvedValue({ p1: makeFinancials(500) });

    const { handleWaterfallCredit } = buildHook({ players: [p1] });
    await handleWaterfallCredit(250, 'Bake Sale', '', 'orig-tx', 'FUN', [{ playerId: 'p1', amount: 100 }]);

    const calls = supabaseService.addTransaction.mock.calls.map((c) => c[0]);
    expect(calls.find((c) => c.playerId === 'p1')?.amount).toBe(100);
    expect(calls.find((c) => c.playerId === null)?.amount).toBeCloseTo(150, 1);
  });

  it('applies amounts above a player’s remaining balance without capping', async () => {
    const p1 = makePlayer('p1');
    supabaseService.getPlayerFinancials.mockResolvedValue({ p1: makeFinancials(40) });

    const { handleWaterfallCredit } = buildHook({ players: [p1] });
    await handleWaterfallCredit(100, 'Sponsor', '', 'orig-tx', 'SPO', [{ playerId: 'p1', amount: 100 }]);

    const calls = supabaseService.addTransaction.mock.calls.map((c) => c[0]);
    expect(calls.find((c) => c.playerId === 'p1')?.amount).toBe(100);
  });

  it('credits fee-waived and non-buy-in players when named explicitly', async () => {
    const p1 = makePlayer('p1', { feeWaived: true });
    const p2 = makePlayer('p2', { buyIn: false });

    supabaseService.getPlayerFinancials.mockResolvedValue({
      p1: makeFinancials(0),
      p2: makeFinancials(300),
    });

    const { handleWaterfallCredit } = buildHook({ players: [p1, p2] });
    await handleWaterfallCredit(80, 'Sponsor', '', 'orig-tx', 'SPO', [
      { playerId: 'p1', amount: 30 },
      { playerId: 'p2', amount: 50 },
    ]);

    const calls = supabaseService.addTransaction.mock.calls.map((c) => c[0]);
    expect(calls.find((c) => c.playerId === 'p1')?.amount).toBe(30);
    expect(calls.find((c) => c.playerId === 'p2')?.amount).toBe(50);
  });

  it('merges duplicate rows for the same player', async () => {
    const p1 = makePlayer('p1');
    supabaseService.getPlayerFinancials.mockResolvedValue({ p1: makeFinancials(500) });

    const { handleWaterfallCredit } = buildHook({ players: [p1] });
    await handleWaterfallCredit(100, 'Sponsor', '', 'orig-tx', 'SPO', [
      { playerId: 'p1', amount: 60 },
      { playerId: 'p1', amount: 40 },
    ]);

    const playerCalls = supabaseService.addTransaction.mock.calls.map((c) => c[0]).filter((c) => c.playerId === 'p1');
    expect(playerCalls).toHaveLength(1);
    expect(playerCalls[0].amount).toBe(100);
  });

  it('ignores blank and zero rows', async () => {
    const p1 = makePlayer('p1');
    const p2 = makePlayer('p2');
    supabaseService.getPlayerFinancials.mockResolvedValue({
      p1: makeFinancials(500),
      p2: makeFinancials(500),
    });

    const { handleWaterfallCredit } = buildHook({ players: [p1, p2] });
    await handleWaterfallCredit(50, 'Sponsor', '', 'orig-tx', 'SPO', [
      { playerId: 'p1', amount: 50 },
      { playerId: 'p2', amount: '' },
      { playerId: '', amount: 25 },
    ]);

    const calls = supabaseService.addTransaction.mock.calls.map((c) => c[0]);
    expect(calls.find((c) => c.playerId === 'p2')).toBeUndefined();
    expect(calls.find((c) => c.playerId === 'p1')?.amount).toBe(50);
  });

  it('throws when the split exceeds the total amount', async () => {
    const p1 = makePlayer('p1');
    supabaseService.getPlayerFinancials.mockResolvedValue({ p1: makeFinancials(500) });

    const { handleWaterfallCredit } = buildHook({ players: [p1] });
    await expect(
      handleWaterfallCredit(100, 'Sponsor', '', 'orig-tx', 'SPO', [{ playerId: 'p1', amount: 150 }]),
    ).rejects.toThrow('Manual split exceeds the total amount being distributed.');
    expect(supabaseService.addTransaction).not.toHaveBeenCalled();
  });

  it('throws when a negative amount is supplied', async () => {
    const p1 = makePlayer('p1');
    supabaseService.getPlayerFinancials.mockResolvedValue({ p1: makeFinancials(500) });

    const { handleWaterfallCredit } = buildHook({ players: [p1] });
    await expect(
      handleWaterfallCredit(100, 'Sponsor', '', 'orig-tx', 'SPO', [{ playerId: 'p1', amount: -20 }]),
    ).rejects.toThrow('Manual split amounts cannot be negative.');
  });

  it('throws when an allocation names a player off the roster', async () => {
    const p1 = makePlayer('p1');
    supabaseService.getPlayerFinancials.mockResolvedValue({ p1: makeFinancials(500) });

    const { handleWaterfallCredit } = buildHook({ players: [p1] });
    await expect(
      handleWaterfallCredit(100, 'Sponsor', '', 'orig-tx', 'SPO', [{ playerId: 'ghost', amount: 100 }]),
    ).rejects.toThrow('Manual split references a player who is not on this roster.');
  });

  it('falls back to the season method when allocations are empty', async () => {
    const p1 = makePlayer('p1');
    supabaseService.getPlayerFinancials.mockResolvedValue({ p1: makeFinancials(500) });

    const { handleWaterfallCredit } = buildHook({ players: [p1] });
    await handleWaterfallCredit(120, 'Sponsor', 'p1', 'orig-tx', 'SPO', []);

    const calls = supabaseService.addTransaction.mock.calls.map((c) => c[0]);
    expect(calls.find((c) => c.playerId === 'p1')?.amount).toBe(120);
  });
});

// ── revertWaterfall ───────────────────────────────────────────────────────────
describe('revertWaterfall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseService.deleteBatch.mockResolvedValue([{ id: 'c1' }]);
    supabaseService.deleteOrphanedDistributionCredits.mockResolvedValue([]);
    supabaseService.getBatchTransactionIds.mockResolvedValue([]);
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

  it('sweeps credits left behind by a half-written batch', async () => {
    const { revertWaterfall } = buildHook();
    await revertWaterfall('waterfall_123', 'orig-tx-id');

    expect(supabaseService.deleteOrphanedDistributionCredits).toHaveBeenCalledWith('orig-tx-id');
  });

  // The ghost-transaction bug: a delete that removes nothing is not an error, so
  // the credits stayed on the parents' statements while the deposit was reopened
  // and the history row that could have undone them disappeared.
  it('throws and leaves the deposit distributed when credits survive the delete', async () => {
    supabaseService.deleteBatch.mockResolvedValue([]);
    supabaseService.getBatchTransactionIds.mockResolvedValue([{ id: 'ghost-1' }, { id: 'ghost-2' }]);

    const { revertWaterfall } = buildHook();
    await expect(revertWaterfall('waterfall_123', 'orig-tx-id')).rejects.toThrow(/2 credit transaction/);

    expect(supabaseService.updateTransaction).not.toHaveBeenCalled();
  });

  it('completes quietly when the batch was already gone', async () => {
    supabaseService.deleteBatch.mockResolvedValue([]);
    supabaseService.getBatchTransactionIds.mockResolvedValue([]);

    const { revertWaterfall } = buildHook();
    await revertWaterfall('waterfall_123', 'orig-tx-id');

    expect(supabaseService.updateTransaction).toHaveBeenCalledWith('orig-tx-id', { distributed: false });
  });
});

// ── partial-distribution rollback ─────────────────────────────────────────────
describe('handleWaterfallCredit failure handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseService.deleteBatch.mockResolvedValue([]);
  });

  it('removes the half-written batch when an insert fails', async () => {
    const p1 = makePlayer('p1');
    supabaseService.getPlayerFinancials.mockResolvedValue({ p1: makeFinancials(100) });
    supabaseService.addTransaction.mockRejectedValue(new Error('row-level security'));

    const { handleWaterfallCredit } = buildHook({ players: [p1], financials: { p1: makeFinancials(100) } });
    await expect(handleWaterfallCredit(100, 'Sponsor', 'p1', 'orig-tx', 'SPO')).rejects.toThrow('row-level security');

    expect(supabaseService.deleteBatch).toHaveBeenCalledWith('waterfallBatchId', expect.stringMatching(/^waterfall_/));
    expect(supabaseService.updateTransaction).not.toHaveBeenCalled();
  });

  it('does not mark the deposit distributed when the flag update fails', async () => {
    const p1 = makePlayer('p1');
    supabaseService.getPlayerFinancials.mockResolvedValue({ p1: makeFinancials(100) });
    supabaseService.addTransaction.mockResolvedValue({ id: 'c1' });
    supabaseService.updateTransaction.mockRejectedValue(new Error('update blocked'));

    const { handleWaterfallCredit } = buildHook({ players: [p1], financials: { p1: makeFinancials(100) } });
    await expect(handleWaterfallCredit(100, 'Sponsor', 'p1', 'orig-tx', 'SPO')).rejects.toThrow('update blocked');

    expect(supabaseService.deleteBatch).toHaveBeenCalledWith('waterfallBatchId', expect.stringMatching(/^waterfall_/));
  });
});
