import { useState, useEffect, useCallback, useMemo } from 'react';
import { accountService } from '../services/accountService';

/**
 * useAccounts
 *
 * Fetches team-scoped accounts and exposes CRUD helpers + grouped views.
 *
 * @param {string|null} teamId
 */
export const useAccounts = (teamId) => {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const fetchAccounts = useCallback(async () => {
    if (!teamId) {
      setAccounts([]);
      setLoading(false);
      return;
    }
    try {
      const rows = await accountService.getAccountsForTeam(teamId);
      setAccounts(rows);
    } catch (err) {
      console.error('Failed to fetch accounts:', err);
    } finally {
      setLoading(false);
    }
  }, [teamId]);

  useEffect(() => {
    setLoading(true);
    fetchAccounts();
  }, [fetchAccounts]);

  const saveAccount = useCallback(
    async (accountData) => {
      if (!teamId) return;
      setIsSaving(true);
      try {
        if (accountData.id) {
          await accountService.updateAccount(accountData.id, accountData);
        } else {
          await accountService.addAccount({ ...accountData, teamId });
        }
        await fetchAccounts();
      } finally {
        setIsSaving(false);
      }
    },
    [teamId, fetchAccounts],
  );

  const deleteAccount = useCallback(
    async (accountId) => {
      setIsSaving(true);
      try {
        await accountService.deleteAccount(accountId);
        await fetchAccounts();
      } finally {
        setIsSaving(false);
      }
    },
    [fetchAccounts],
  );

  const activeAccounts = useMemo(() => accounts.filter((a) => a.isActive), [accounts]);

  const accountsByHolding = useMemo(() => {
    const grouped = { digital: [], bank: [], cash: [], none: [] };
    activeAccounts.forEach((a) => {
      if (grouped[a.holding]) grouped[a.holding].push(a);
    });
    return grouped;
  }, [activeAccounts]);

  const accountMap = useMemo(() => {
    const m = {};
    accounts.forEach((a) => {
      m[a.id] = a;
    });
    return m;
  }, [accounts]);

  return {
    accounts,
    activeAccounts,
    accountsByHolding,
    accountMap,
    saveAccount,
    deleteAccount,
    loading,
    isSaving,
    refetch: fetchAccounts,
  };
};
