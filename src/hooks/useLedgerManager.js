// src/hooks/useLedgerManager.js
// Transaction CRUD. Now team-season aware + transfer support.
// Optimistic updates: local state is updated immediately and rolled back on error.

import { supabaseService } from '../services/supabaseService';
import { validateTransaction } from '../utils/validation';

// Postgres RLS rejections surface verbatim ("new row violates row-level
// security policy for table ..."), which tells a coach nothing. Every path
// that can hit one here is an access problem, so say that instead.
const describeError = (error) => {
  const message = error?.message || 'Something went wrong. Please try again.';
  return /row-level security/i.test(message) ? "You don't have permission to change this team's ledger." : message;
};

export const useLedgerManager = (
  refreshData,
  selectedSeason,
  teamSeasonId = null,
  setTransactions = null,
  { teamId = null, onTeamSeasonCreated = null } = {},
) => {
  // A team has no team_seasons row until its budget is first drafted, but the
  // transactions RLS policy authorizes on team_season_id — so inserting with a
  // null one is rejected outright ("new row violates row-level security
  // policy") for everyone except super admins. Create the draft row on demand
  // so logging a transaction doesn't require setting up a budget first.
  const resolveTeamSeasonId = async () => {
    if (teamSeasonId) return teamSeasonId;
    if (!teamId || !selectedSeason) return null;
    const created = await supabaseService.ensureTeamSeason(teamId, selectedSeason);
    if (created) await onTeamSeasonCreated?.();
    return created;
  };

  const handleSaveTransaction = async (txData) => {
    const validationError = validateTransaction(txData);
    if (validationError) return { success: false, error: validationError };

    try {
      let dateStr = txData.date;
      if (txData.date && txData.date.seconds) {
        dateStr = new Date(txData.date.seconds * 1000).toISOString().split('T')[0];
      } else if (typeof txData.date === 'string' && txData.date.includes('T')) {
        dateStr = txData.date.split('T')[0];
      }

      // Existing transactions keep the team season they were filed under;
      // new ones need one resolved (or created) before they can be inserted.
      const scopeId = txData.teamSeasonId || (txData.id ? teamSeasonId : await resolveTeamSeasonId());
      if (!txData.id && !scopeId) {
        return { success: false, error: 'Select a team before logging a transaction.' };
      }

      const formattedData = {
        ...txData,
        date: dateStr,
        seasonId: txData.seasonId || selectedSeason,
        // Attach team_season_id if available (new transactions get scoped)
        ...(scopeId && !txData.teamSeasonId ? { teamSeasonId: scopeId } : {}),
      };

      // Optimistic update: reflect change in UI before server confirms
      const tempId = `opt_${Date.now()}`;
      if (setTransactions) {
        if (formattedData.id) {
          setTransactions((prev) => prev.map((tx) => (tx.id === formattedData.id ? { ...tx, ...formattedData } : tx)));
        } else {
          setTransactions((prev) => [{ ...formattedData, _optimistic: true, id: tempId }, ...prev]);
        }
      }

      let saved = null;
      if (formattedData.id) {
        await supabaseService.updateTransaction(formattedData.id, formattedData);
      } else {
        saved = await supabaseService.addTransaction(formattedData);
      }

      await refreshData();

      // Reconcile AFTER the refetch, not before it. refreshData() replaces the
      // whole transaction list with whatever its own query returned, and it
      // discards its result outright if another fetch started in the meantime
      // — so a transaction that saved fine could vanish from the ledger until
      // the page was reloaded. The row the write itself returned is the one
      // piece of state that cannot be stale, so it goes in last.
      if (setTransactions) {
        setTransactions((prev) => {
          const withoutTemp = prev.filter((tx) => tx.id !== tempId);
          if (!saved || withoutTemp.some((tx) => tx.id === saved.id)) return withoutTemp;
          return [saved, ...withoutTemp];
        });
      }
      return { success: true };
    } catch (error) {
      // Rollback optimistic update on failure
      if (setTransactions) {
        await refreshData();
      }
      console.error('Transaction save failed:', error);
      return { success: false, error: describeError(error) };
    }
  };

  const handleDeleteTransaction = async (txId) => {
    let snapshot = null;
    try {
      // Optimistic removal
      if (setTransactions) {
        setTransactions((prev) => {
          snapshot = prev;
          return prev.filter((tx) => tx.id !== txId);
        });
      }

      await supabaseService.deleteTransaction(txId);
      await refreshData();
      // Same reconciliation as on save: a stale refetch must not resurrect a
      // row that is already gone from the database.
      if (setTransactions) setTransactions((prev) => prev.filter((tx) => tx.id !== txId));
      return { success: true };
    } catch (error) {
      // Rollback
      if (setTransactions && snapshot) setTransactions(snapshot);
      console.error('Failed to delete transaction:', error);
      return { success: false, error: describeError(error) };
    }
  };

  const handleBulkUpload = async (txns) => {
    try {
      const scopeId = await resolveTeamSeasonId();
      if (!scopeId) {
        return { success: false, error: 'Select a team before importing transactions.' };
      }

      const normalised = txns.map((tx) => {
        let dateStr = tx.date;
        if (tx.date && tx.date.seconds) {
          dateStr = new Date(tx.date.seconds * 1000).toISOString().split('T')[0];
        } else if (typeof tx.date === 'string' && tx.date.includes('T')) {
          dateStr = tx.date.split('T')[0];
        }
        return {
          ...tx,
          date: dateStr,
          seasonId: tx.seasonId || selectedSeason,
          ...(tx.teamSeasonId ? {} : { teamSeasonId: scopeId }),
        };
      });

      const savedRows = await supabaseService.bulkAddTransactions(normalised, selectedSeason, scopeId);
      await refreshData();
      if (setTransactions && savedRows?.length) {
        setTransactions((prev) => {
          const present = new Set(prev.map((tx) => tx.id));
          const missing = savedRows.filter((tx) => !present.has(tx.id));
          return missing.length > 0 ? [...missing, ...prev] : prev;
        });
      }
      return { success: true };
    } catch (error) {
      console.error('Bulk upload failed:', error);
      return { success: false, error: describeError(error) };
    }
  };

  return { handleSaveTransaction, handleDeleteTransaction, handleBulkUpload };
};
