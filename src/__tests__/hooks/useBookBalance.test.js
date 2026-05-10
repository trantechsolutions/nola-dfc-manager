import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

vi.mock('../../services/bookBalanceService', () => ({
  bookBalanceService: {
    getForTeamMonth: vi.fn(),
    upsertBalance: vi.fn(),
    lockMonth: vi.fn(),
    unlockMonth: vi.fn(),
  },
}));

import { bookBalanceService } from '../../services/bookBalanceService';
import { useBookBalance } from '../../hooks/useBookBalance';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const TEAM_ID = 'team-001';

const ACCOUNTS = [
  { id: 'acct-bank', name: 'Chase', holding: 'bank', isActive: true },
  { id: 'acct-digital', name: 'Venmo', holding: 'digital', isActive: true },
  { id: 'acct-none', name: 'Credits', holding: 'none', isActive: true },
];

const TRANSACTIONS = [
  { id: 't1', category: 'INC', accountId: 'acct-bank', amount: 500, rawDate: '2025-03-10', date: null },
  { id: 't2', category: 'EXP', accountId: 'acct-digital', amount: -100, rawDate: '2025-03-15', date: null },
];

const makeStoredRow = (overrides = {}) => ({
  id: 'row-uuid-1',
  accountId: 'acct-bank',
  teamId: TEAM_ID,
  monthKey: '2025-03-01',
  statedBalance: 480,
  ledgerBalance: null,
  delta: null,
  isLocked: false,
  notes: '',
  createdAt: '2025-03-01T00:00:00Z',
  updatedAt: '2025-03-01T00:00:00Z',
  ...overrides,
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useBookBalance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    bookBalanceService.getForTeamMonth.mockResolvedValue([]);
    bookBalanceService.upsertBalance.mockResolvedValue(makeStoredRow());
    bookBalanceService.lockMonth.mockResolvedValue(undefined);
    bookBalanceService.unlockMonth.mockResolvedValue(undefined);
  });

  it('initializes with current month selected', () => {
    const { result } = renderHook(() => useBookBalance(TEAM_ID, [], []));
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    expect(result.current.selectedMonth).toBe(`${y}-${m}-01`);
  });

  it('fetches rows on mount', async () => {
    renderHook(() => useBookBalance(TEAM_ID, [], []));
    await waitFor(() => {
      expect(bookBalanceService.getForTeamMonth).toHaveBeenCalledWith(
        TEAM_ID,
        expect.stringMatching(/^\d{4}-\d{2}-01$/),
      );
    });
  });

  it('does not fetch when teamId is null', async () => {
    renderHook(() => useBookBalance(null, [], []));
    await waitFor(() => {
      expect(bookBalanceService.getForTeamMonth).not.toHaveBeenCalled();
    });
  });

  it('computes ledger balances from transactions', async () => {
    const { result } = renderHook(() => useBookBalance(TEAM_ID, TRANSACTIONS, ACCOUNTS));
    // Wait for mount fetch
    await waitFor(() => expect(result.current.loading).toBe(false));

    // We need to select a month that covers the test transactions
    act(() => result.current.setSelectedMonth('2025-03-01'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.ledgerBalances['acct-bank']).toBe(500);
    expect(result.current.ledgerBalances['acct-digital']).toBe(-100);
    // 'none' holding excluded
    expect('acct-none' in result.current.ledgerBalances).toBe(false);
  });

  it('isMonthLocked is false when no rows stored', async () => {
    const { result } = renderHook(() => useBookBalance(TEAM_ID, [], ACCOUNTS));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isMonthLocked).toBe(false);
  });

  it('isMonthLocked is true when all rows are locked', async () => {
    bookBalanceService.getForTeamMonth.mockResolvedValue([
      makeStoredRow({ isLocked: true }),
      makeStoredRow({ id: 'row-2', accountId: 'acct-digital', isLocked: true }),
    ]);
    const { result } = renderHook(() => useBookBalance(TEAM_ID, [], ACCOUNTS));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isMonthLocked).toBe(true);
  });

  it('isMonthLocked is false when at least one row is unlocked', async () => {
    bookBalanceService.getForTeamMonth.mockResolvedValue([
      makeStoredRow({ isLocked: true }),
      makeStoredRow({ id: 'row-2', accountId: 'acct-digital', isLocked: false }),
    ]);
    const { result } = renderHook(() => useBookBalance(TEAM_ID, [], ACCOUNTS));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isMonthLocked).toBe(false);
  });

  it('saveBalance calls upsert and refetches', async () => {
    const { result } = renderHook(() => useBookBalance(TEAM_ID, [], ACCOUNTS));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.saveBalance({ accountId: 'acct-bank', statedBalance: 500, notes: 'ok' });
    });

    expect(bookBalanceService.upsertBalance).toHaveBeenCalledWith(
      expect.objectContaining({ accountId: 'acct-bank', statedBalance: 500 }),
    );
    expect(bookBalanceService.getForTeamMonth).toHaveBeenCalledTimes(2); // initial + after save
  });

  it('unlockMonth calls service and refetches', async () => {
    const { result } = renderHook(() => useBookBalance(TEAM_ID, [], ACCOUNTS));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.unlockMonth();
    });

    expect(bookBalanceService.unlockMonth).toHaveBeenCalledWith(TEAM_ID, expect.stringMatching(/^\d{4}-\d{2}-01$/));
    expect(bookBalanceService.getForTeamMonth).toHaveBeenCalledTimes(2);
  });

  it('monthOptions includes season sentinel + 13 descending month keys', () => {
    const { result } = renderHook(() => useBookBalance(TEAM_ID, [], []));
    expect(result.current.monthOptions).toHaveLength(14);
    expect(result.current.monthOptions[0]).toBe('season');
    // Month keys are descending (index 1 onward)
    for (let i = 1; i < 13; i++) {
      expect(result.current.monthOptions[i] > result.current.monthOptions[i + 1]).toBe(true);
    }
  });

  it('isSeasonView is false by default, true when season selected', () => {
    const { result } = renderHook(() => useBookBalance(TEAM_ID, [], []));
    // Default is current month, not season
    expect(result.current.isSeasonView).toBe(false);
    act(() => result.current.setSelectedMonth('season'));
    expect(result.current.isSeasonView).toBe(true);
  });

  it('does not fetch DB rows in season view', async () => {
    const { result } = renderHook(() => useBookBalance(TEAM_ID, [], []));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const callsBefore = bookBalanceService.getForTeamMonth.mock.calls.length;

    act(() => result.current.setSelectedMonth('season'));
    // Season mode skips the fetch — call count unchanged
    await waitFor(() => expect(result.current.isSeasonView).toBe(true));
    expect(bookBalanceService.getForTeamMonth.mock.calls.length).toBe(callsBefore);
  });
});
