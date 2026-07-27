import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// ── Mock supabaseService before importing the hook ────────────────────────────
vi.mock('../../services/supabaseService', () => ({
  supabaseService: {
    addTransaction: vi.fn(),
    updateTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
    bulkAddTransactions: vi.fn(),
    ensureTeamSeason: vi.fn(),
  },
}));

import { supabaseService } from '../../services/supabaseService';
import { useLedgerManager } from '../../hooks/useLedgerManager';

const SEASON = '2025-2026';
const TEAM_SEASON_ID = 'ts-uuid-001';
const TEAM_ID = 'team-uuid-001';

const validTx = (overrides = {}) => ({
  title: 'Balance Forward',
  amount: 7088.65,
  date: '2026-07-24',
  category: 'FUN',
  ...overrides,
});

// Stand-in for App's setTransactions: applies the updater to a local array so
// tests can assert on what the ledger would actually render.
const makeStore = (initial = []) => {
  const store = { rows: initial };
  store.setTransactions = (updater) => {
    store.rows = typeof updater === 'function' ? updater(store.rows) : updater;
  };
  return store;
};

const buildHook = ({ store, refreshData = vi.fn(), teamSeasonId = TEAM_SEASON_ID, teamId = TEAM_ID } = {}) => {
  const { result } = renderHook(() =>
    useLedgerManager(refreshData, SEASON, teamSeasonId, store?.setTransactions ?? null, { teamId }),
  );
  return result.current;
};

beforeEach(() => {
  vi.clearAllMocks();
  supabaseService.addTransaction.mockImplementation(async (tx) => ({ ...tx, id: 'saved-1' }));
});

describe('handleSaveTransaction', () => {
  it('keeps the saved transaction in state when the refetch returns a stale list', async () => {
    const store = makeStore();
    // refreshData standing in for a fetch whose result lands without the new
    // row (a discarded in-flight fetch, or one that resolved first).
    const refreshData = vi.fn(async () => store.setTransactions([]));

    const { handleSaveTransaction } = buildHook({ store, refreshData });
    const res = await handleSaveTransaction(validTx());

    expect(res.success).toBe(true);
    expect(store.rows.map((t) => t.id)).toContain('saved-1');
  });

  it('replaces the optimistic placeholder rather than leaving a duplicate', async () => {
    const store = makeStore();
    const { handleSaveTransaction } = buildHook({ store });

    await handleSaveTransaction(validTx());

    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].id).toBe('saved-1');
    expect(store.rows[0]._optimistic).toBeUndefined();
  });

  it('does not double-insert when the refetch already produced the row', async () => {
    const store = makeStore();
    const refreshData = vi.fn(async () => store.setTransactions([{ id: 'saved-1', title: 'Balance Forward' }]));

    const { handleSaveTransaction } = buildHook({ store, refreshData });
    await handleSaveTransaction(validTx());

    expect(store.rows.filter((t) => t.id === 'saved-1')).toHaveLength(1);
  });

  it('scopes a new transaction to the team season', async () => {
    const { handleSaveTransaction } = buildHook();
    await handleSaveTransaction(validTx());

    const [txArgs] = supabaseService.addTransaction.mock.calls[0];
    expect(txArgs.teamSeasonId).toBe(TEAM_SEASON_ID);
    expect(txArgs.seasonId).toBe(SEASON);
  });

  it('creates the team season on demand when the team has none yet', async () => {
    supabaseService.ensureTeamSeason.mockResolvedValue('ts-created');

    const { handleSaveTransaction } = buildHook({ teamSeasonId: null });
    await handleSaveTransaction(validTx());

    expect(supabaseService.ensureTeamSeason).toHaveBeenCalledWith(TEAM_ID, SEASON);
    expect(supabaseService.addTransaction.mock.calls[0][0].teamSeasonId).toBe('ts-created');
  });

  it('refuses to save unscoped when there is no team to scope to', async () => {
    const { handleSaveTransaction } = buildHook({ teamSeasonId: null, teamId: null });
    const res = await handleSaveTransaction(validTx());

    expect(res.success).toBe(false);
    expect(supabaseService.addTransaction).not.toHaveBeenCalled();
  });

  it('reports RLS rejections in plain language', async () => {
    supabaseService.addTransaction.mockRejectedValue(
      new Error('new row violates row-level security policy for table "transactions"'),
    );

    const { handleSaveTransaction } = buildHook();
    const res = await handleSaveTransaction(validTx());

    expect(res.success).toBe(false);
    expect(res.error).not.toMatch(/row-level security/i);
    expect(res.error).toMatch(/permission/i);
  });

  it('edits an existing transaction without re-scoping or re-inserting it', async () => {
    const { handleSaveTransaction } = buildHook();
    await handleSaveTransaction(validTx({ id: 'existing-1', teamSeasonId: 'ts-other' }));

    expect(supabaseService.addTransaction).not.toHaveBeenCalled();
    expect(supabaseService.updateTransaction).toHaveBeenCalled();
    expect(supabaseService.ensureTeamSeason).not.toHaveBeenCalled();
  });
});

describe('handleDeleteTransaction', () => {
  it('keeps the row deleted when the refetch still returns it', async () => {
    const store = makeStore([{ id: 'tx-1', title: 'Old' }]);
    const refreshData = vi.fn(async () => store.setTransactions([{ id: 'tx-1', title: 'Old' }]));

    const { handleDeleteTransaction } = buildHook({ store, refreshData });
    const res = await handleDeleteTransaction('tx-1');

    expect(res.success).toBe(true);
    expect(store.rows).toHaveLength(0);
  });
});

describe('handleBulkUpload', () => {
  it('shows imported rows the refetch missed', async () => {
    const store = makeStore();
    const refreshData = vi.fn(async () => store.setTransactions([]));
    supabaseService.bulkAddTransactions.mockResolvedValue([
      { id: 'bulk-1', title: 'Row 1' },
      { id: 'bulk-2', title: 'Row 2' },
    ]);

    const { handleBulkUpload } = buildHook({ store, refreshData });
    await handleBulkUpload([validTx(), validTx({ title: 'Row 2' })]);

    expect(store.rows.map((t) => t.id).sort()).toEqual(['bulk-1', 'bulk-2']);
  });

  it('does not duplicate rows the refetch already returned', async () => {
    const store = makeStore();
    const refreshData = vi.fn(async () => store.setTransactions([{ id: 'bulk-1', title: 'Row 1' }]));
    supabaseService.bulkAddTransactions.mockResolvedValue([{ id: 'bulk-1', title: 'Row 1' }]);

    const { handleBulkUpload } = buildHook({ store, refreshData });
    await handleBulkUpload([validTx()]);

    expect(store.rows).toHaveLength(1);
  });
});
