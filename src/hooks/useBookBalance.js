import { useState, useEffect, useCallback, useMemo } from 'react';
import { bookBalanceService } from '../services/bookBalanceService';
import {
  computeAllLedgerBalances,
  computeBankLedgerTotal,
  buildMonthOptions,
  toMonthKey,
  SEASON_KEY,
} from '../utils/computeBookBalance';

/**
 * useBookBalance
 *
 * Manages monthly book-balance reconciliation for a team.
 *
 * @param {string|null} teamId
 * @param {Array}       transactions  - All team transactions (already loaded)
 * @param {Array}       accounts      - All team accounts (already loaded)
 */
export function useBookBalance(teamId, transactions, accounts) {
  // Prepend SEASON_KEY so the picker shows "Entire Season" as the first option
  const monthOptions = useMemo(() => [SEASON_KEY, ...buildMonthOptions(13)], []);
  // Default to the current month (index 1), not the season sentinel
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[1]);

  // Stored rows from account_balances for the selected month
  const [balanceRows, setBalanceRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const fetchRows = useCallback(async () => {
    if (!teamId || !selectedMonth) return;
    // Season view has no stored per-month rows — clear any stale rows and skip fetch
    if (selectedMonth === SEASON_KEY) {
      setBalanceRows([]);
      return;
    }
    setLoading(true);
    try {
      const rows = await bookBalanceService.getForTeamMonth(teamId, selectedMonth);
      setBalanceRows(rows);
    } catch (err) {
      console.error('[useBookBalance] fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, [teamId, selectedMonth]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  // Active bank accounts grouped for aggregate reconciliation
  const bankAccounts = useMemo(() => accounts.filter((a) => a.holding === 'bank' && a.isActive), [accounts]);

  // The first bank account is the canonical storage key for the bank aggregate row
  const primaryBankAccountId = useMemo(() => bankAccounts[0]?.id ?? null, [bankAccounts]);

  // Computed ledger totals from the local transaction prop
  const ledgerBalances = useMemo(
    () => computeAllLedgerBalances(accounts, transactions, selectedMonth),
    [accounts, transactions, selectedMonth],
  );

  // Combined ledger total for all bank accounts
  const bankLedgerTotal = useMemo(
    () => computeBankLedgerTotal(accounts, transactions, selectedMonth),
    [accounts, transactions, selectedMonth],
  );

  // Index stored rows by accountId for easy lookup (individual digital/cash)
  const storedByAccount = useMemo(() => {
    const m = {};
    balanceRows.forEach((r) => {
      m[r.accountId] = r;
    });
    return m;
  }, [balanceRows]);

  // The single stored row representing the bank aggregate (keyed to primaryBankAccountId)
  const bankStoredRow = useMemo(
    () => (primaryBankAccountId ? (storedByAccount[primaryBankAccountId] ?? null) : null),
    [primaryBankAccountId, storedByAccount],
  );

  const isMonthLocked = useMemo(() => balanceRows.length > 0 && balanceRows.every((r) => r.isLocked), [balanceRows]);

  /** Save (upsert) the stated balance for one non-bank account in the selected month. */
  const saveBalance = useCallback(
    async ({ accountId, statedBalance, notes }) => {
      if (!teamId) return;
      setIsSaving(true);
      try {
        await bookBalanceService.upsertBalance({
          accountId,
          teamId,
          monthKey: selectedMonth,
          statedBalance,
          notes,
        });
        await fetchRows();
      } finally {
        setIsSaving(false);
      }
    },
    [teamId, selectedMonth, fetchRows],
  );

  /**
   * Save the aggregate stated balance for ALL bank accounts as one row,
   * stored against the primary bank account ID.
   */
  const saveBankBalance = useCallback(
    async ({ statedBalance, notes }) => {
      if (!teamId || !primaryBankAccountId) return;
      setIsSaving(true);
      try {
        await bookBalanceService.upsertBalance({
          accountId: primaryBankAccountId,
          teamId,
          monthKey: selectedMonth,
          statedBalance,
          notes,
        });
        await fetchRows();
      } finally {
        setIsSaving(false);
      }
    },
    [teamId, primaryBankAccountId, selectedMonth, fetchRows],
  );

  /**
   * Lock the selected month.
   * Bank accounts: one aggregate row stored against primaryBankAccountId.
   * Digital/cash: one row per account.
   */
  const lockMonth = useCallback(async () => {
    if (!teamId) return;
    setIsSaving(true);
    try {
      // Ensure bank aggregate row exists
      if (primaryBankAccountId && !storedByAccount[primaryBankAccountId]) {
        await bookBalanceService.upsertBalance({
          accountId: primaryBankAccountId,
          teamId,
          monthKey: selectedMonth,
          statedBalance: 0,
          notes: '',
        });
      }
      // Ensure a row exists for every non-bank tracked account
      const nonBankTracked = accounts.filter(
        (a) => a.holding !== 'bank' && Object.prototype.hasOwnProperty.call(ledgerBalances, a.id),
      );
      for (const acct of nonBankTracked) {
        if (!storedByAccount[acct.id]) {
          await bookBalanceService.upsertBalance({
            accountId: acct.id,
            teamId,
            monthKey: selectedMonth,
            statedBalance: 0,
            notes: '',
          });
        }
      }
      // Re-fetch to get fresh IDs
      const fresh = await bookBalanceService.getForTeamMonth(teamId, selectedMonth);
      const updates = fresh.map((row) => {
        // Bank aggregate row: use bankLedgerTotal; all other rows use per-account balance
        const isBankRow = row.accountId === primaryBankAccountId;
        return {
          id: row.id,
          ledgerBalance: isBankRow ? bankLedgerTotal : (ledgerBalances[row.accountId] ?? 0),
          statedBalance: row.statedBalance,
        };
      });
      await bookBalanceService.lockMonth(updates);
      await fetchRows();
    } finally {
      setIsSaving(false);
    }
  }, [
    teamId,
    selectedMonth,
    accounts,
    ledgerBalances,
    bankLedgerTotal,
    primaryBankAccountId,
    storedByAccount,
    fetchRows,
  ]);

  /** Unlock the selected month (super-admin only). */
  const unlockMonth = useCallback(async () => {
    if (!teamId) return;
    setIsSaving(true);
    try {
      await bookBalanceService.unlockMonth(teamId, selectedMonth);
      await fetchRows();
    } finally {
      setIsSaving(false);
    }
  }, [teamId, selectedMonth, fetchRows]);

  return {
    monthOptions,
    selectedMonth,
    isSeasonView: selectedMonth === SEASON_KEY,
    setSelectedMonth: (m) => {
      // Pass SEASON_KEY through unchanged; normalise all others to a month key
      if (m === SEASON_KEY) {
        setSelectedMonth(SEASON_KEY);
        return;
      }
      setSelectedMonth(toMonthKey(m) ?? m);
    },
    ledgerBalances,
    storedByAccount,
    // Bank aggregate
    bankAccounts,
    bankLedgerTotal,
    bankStoredRow,
    saveBankBalance,
    isMonthLocked,
    loading,
    isSaving,
    saveBalance,
    lockMonth,
    unlockMonth,
    refetch: fetchRows,
  };
}
