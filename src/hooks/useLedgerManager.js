// src/hooks/useLedgerManager.js
// Transaction CRUD. Now team-season aware + transfer support.
// Optimistic updates: local state is updated immediately and rolled back on error.

import { supabaseService } from '../services/supabaseService';
import { validateTransaction } from '../utils/validation';
import { buildRefundTransaction, refundableRemaining } from '../utils/refunds';
import { buildInstallmentTransaction, canRecordPayment, outstandingOn } from '../utils/installments';

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
      if (setTransactions) {
        if (formattedData.id) {
          setTransactions((prev) => prev.map((tx) => (tx.id === formattedData.id ? { ...tx, ...formattedData } : tx)));
        } else {
          // Temp optimistic record — will be replaced by fetchData with real id
          setTransactions((prev) => [{ ...formattedData, _optimistic: true, id: `opt_${Date.now()}` }, ...prev]);
        }
      }

      if (formattedData.id) {
        await supabaseService.updateTransaction(formattedData.id, formattedData);
      } else {
        await supabaseService.addTransaction(formattedData);
      }
      await refreshData();
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

  // A refund is recorded as its own reversing row rather than by editing the
  // original, so the ledger keeps both sides of the story and every downstream
  // total (book balance, player financials, exports) nets out without changes.
  const handleRefundTransaction = async (
    originalTx,
    { amount, date, notes, cleared = true } = {},
    refundIndex = {},
  ) => {
    if (!originalTx?.id) return { success: false, error: 'Nothing to refund.' };

    const remaining = refundableRemaining(originalTx, refundIndex);
    const magnitude = Math.round((Math.abs(Number(amount)) || 0) * 100) / 100;
    if (!magnitude) return { success: false, error: 'Enter a refund amount.' };
    if (magnitude > remaining) {
      return { success: false, error: `Refund cannot exceed the ${remaining.toFixed(2)} still outstanding.` };
    }

    return handleSaveTransaction(
      buildRefundTransaction(originalTx, {
        amount: magnitude,
        date: date || new Date().toISOString().split('T')[0],
        notes,
        cleared,
      }),
    );
  };

  // A partial payment is its own row carrying the same sign as the obligation it
  // pays off, so the money lands in the account and against the player the
  // moment it arrives while the unpaid balance stays visibly outstanding.
  const handleRecordPayment = async (parentTx, { amount, date, notes, cleared = true, accountId } = {}, index = {}) => {
    if (!parentTx?.id) return { success: false, error: 'Nothing to pay towards.' };
    if (!canRecordPayment(parentTx, index)) {
      return { success: false, error: 'This entry cannot be paid in instalments.' };
    }

    const remaining = outstandingOn(parentTx, index);
    const magnitude = Math.round((Math.abs(Number(amount)) || 0) * 100) / 100;
    if (!magnitude) return { success: false, error: 'Enter a payment amount.' };
    if (magnitude > remaining) {
      return { success: false, error: `Payment cannot exceed the ${remaining.toFixed(2)} still owed.` };
    }

    return handleSaveTransaction(
      buildInstallmentTransaction(parentTx, {
        amount: magnitude,
        date: date || new Date().toISOString().split('T')[0],
        notes,
        cleared,
        accountId,
      }),
    );
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

      await supabaseService.bulkAddTransactions(normalised, selectedSeason, scopeId);
      await refreshData();
      return { success: true };
    } catch (error) {
      console.error('Bulk upload failed:', error);
      return { success: false, error: describeError(error) };
    }
  };

  return {
    handleSaveTransaction,
    handleRefundTransaction,
    handleRecordPayment,
    handleDeleteTransaction,
    handleBulkUpload,
  };
};
