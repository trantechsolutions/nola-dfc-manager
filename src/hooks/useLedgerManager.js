// src/hooks/useLedgerManager.js
// Transaction CRUD. Now team-season aware + transfer support.
// Optimistic updates: local state is updated immediately and rolled back on error.

import { supabaseService } from '../services/supabaseService';
import { validateTransaction } from '../utils/validation';

export const useLedgerManager = (refreshData, selectedSeason, teamSeasonId = null, setTransactions = null) => {
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

      const formattedData = {
        ...txData,
        date: dateStr,
        seasonId: txData.seasonId || selectedSeason,
        // Attach team_season_id if available (new transactions get scoped)
        ...(teamSeasonId && !txData.teamSeasonId ? { teamSeasonId } : {}),
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
      return { success: false, error: error.message };
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
      return { success: true };
    } catch (error) {
      // Rollback
      if (setTransactions && snapshot) setTransactions(snapshot);
      console.error('Failed to delete transaction:', error);
      return { success: false, error: error.message };
    }
  };

  const handleBulkUpload = async (txns) => {
    try {
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
          ...(teamSeasonId && !tx.teamSeasonId ? { teamSeasonId } : {}),
        };
      });

      await supabaseService.bulkAddTransactions(normalised, selectedSeason, teamSeasonId);
      await refreshData();
      return { success: true };
    } catch (error) {
      console.error('Bulk upload failed:', error);
      return { success: false, error: error.message };
    }
  };

  return { handleSaveTransaction, handleDeleteTransaction, handleBulkUpload };
};
