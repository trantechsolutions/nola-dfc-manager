import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../../services/supabaseService', () => ({
  supabaseService: {
    getAllBudgetItemsForTeam: vi.fn(),
    getAllTransactionsForTeam: vi.fn(),
  },
}));

import { supabaseService } from '../../services/supabaseService';
import { useBudgetForecast } from '../../hooks/useBudgetForecast';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

const TEAM_ID = 'team-uuid-001';

const ONE_SEASON = [{ seasonId: '2024-2025', expectedRosterSize: 15, isFinalized: true }];

const BUDGET_ITEMS = [
  { seasonId: '2024-2025', category: 'OPE', label: 'Equipment', income: 0, expensesFall: 500, expensesSpring: 300 },
];

const TRANSACTIONS = [{ seasonId: '2024-2025', category: 'OPE', amount: -480, cleared: true }];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useBudgetForecast', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseService.getAllBudgetItemsForTeam.mockResolvedValue(BUDGET_ITEMS);
    supabaseService.getAllTransactionsForTeam.mockResolvedValue(TRANSACTIONS);
  });

  it('initializes with null forecast, not loading, no error', () => {
    const { result } = renderHook(() => useBudgetForecast(TEAM_ID, ONE_SEASON));
    expect(result.current.forecast).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('sets error when teamId is missing, returns null', async () => {
    const { result } = renderHook(() => useBudgetForecast(null, ONE_SEASON));
    let ret;
    await act(async () => {
      ret = await result.current.runForecast(15, []);
    });
    expect(ret).toBeNull();
    expect(result.current.error).toBeTruthy();
  });

  it('sets error when teamSeasons is empty, returns null', async () => {
    const { result } = renderHook(() => useBudgetForecast(TEAM_ID, []));
    let ret;
    await act(async () => {
      ret = await result.current.runForecast(15, []);
    });
    expect(ret).toBeNull();
    expect(result.current.error).toBeTruthy();
  });

  it('fetches data and sets forecast on success', async () => {
    const { result } = renderHook(() => useBudgetForecast(TEAM_ID, ONE_SEASON));
    await act(async () => {
      await result.current.runForecast(15, []);
    });
    expect(supabaseService.getAllBudgetItemsForTeam).toHaveBeenCalledWith(TEAM_ID);
    expect(supabaseService.getAllTransactionsForTeam).toHaveBeenCalledWith(TEAM_ID);
    expect(result.current.forecast).not.toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('caches data on second call — network is not hit again', async () => {
    const { result } = renderHook(() => useBudgetForecast(TEAM_ID, ONE_SEASON));
    await act(async () => {
      await result.current.runForecast(15, []);
      await result.current.runForecast(18, []);
    });
    expect(supabaseService.getAllBudgetItemsForTeam).toHaveBeenCalledTimes(1);
  });

  it('bypasses cache when forceRefresh=true', async () => {
    const { result } = renderHook(() => useBudgetForecast(TEAM_ID, ONE_SEASON));
    await act(async () => {
      await result.current.runForecast(15, []);
      await result.current.runForecast(15, [], { forceRefresh: true });
    });
    expect(supabaseService.getAllBudgetItemsForTeam).toHaveBeenCalledTimes(2);
  });

  it('attaches comparison when currentBudgetItems is non-empty', async () => {
    const { result } = renderHook(() => useBudgetForecast(TEAM_ID, ONE_SEASON));
    let ret;
    await act(async () => {
      ret = await result.current.runForecast(15, BUDGET_ITEMS);
    });
    expect(ret.comparison).toBeDefined();
    expect(Array.isArray(ret.comparison)).toBe(true);
  });

  it('does not attach comparison when currentBudgetItems is empty', async () => {
    const { result } = renderHook(() => useBudgetForecast(TEAM_ID, ONE_SEASON));
    let ret;
    await act(async () => {
      ret = await result.current.runForecast(15, []);
    });
    expect(ret.comparison).toBeUndefined();
  });

  it('sets error and returns null when supabase throws', async () => {
    supabaseService.getAllBudgetItemsForTeam.mockRejectedValue(new Error('DB error'));
    const { result } = renderHook(() => useBudgetForecast(TEAM_ID, ONE_SEASON));
    let ret;
    await act(async () => {
      ret = await result.current.runForecast(15, []);
    });
    expect(ret).toBeNull();
    expect(result.current.error).toBe('DB error');
    expect(result.current.loading).toBe(false);
  });

  it('clearForecast resets forecast and error to null', async () => {
    const { result } = renderHook(() => useBudgetForecast(TEAM_ID, ONE_SEASON));
    await act(async () => {
      await result.current.runForecast(15, []);
    });
    expect(result.current.forecast).not.toBeNull();
    act(() => {
      result.current.clearForecast();
    });
    expect(result.current.forecast).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('invalidateCache forces re-fetch on next runForecast', async () => {
    const { result } = renderHook(() => useBudgetForecast(TEAM_ID, ONE_SEASON));
    await act(async () => {
      await result.current.runForecast(15, []);
    });
    act(() => {
      result.current.invalidateCache();
    });
    await act(async () => {
      await result.current.runForecast(15, []);
    });
    expect(supabaseService.getAllBudgetItemsForTeam).toHaveBeenCalledTimes(2);
  });

  it('loading is false after fetch completes', async () => {
    const { result } = renderHook(() => useBudgetForecast(TEAM_ID, ONE_SEASON));
    await act(async () => {
      await result.current.runForecast(15, []);
    });
    expect(result.current.loading).toBe(false);
  });
});
