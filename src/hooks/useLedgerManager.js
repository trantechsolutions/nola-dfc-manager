// src/hooks/useLedgerManager.js
// Transaction CRUD. Now team-season aware.

import { supabaseService } from '../services/supabaseService';

export const useLedgerManager = (refreshData, selectedSeason, teamSeasonId = null) => {
  const handleSaveTransaction = async (txData) => {
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

      if (formattedData.id) {
        await supabaseService.updateTransaction(formattedData.id, formattedData);
      } else {
        await supabaseService.addTransaction(formattedData);
      }
      await refreshData();
      return { success: true };
    } catch (error) {
      console.error("Transaction save failed:", error);
      return { success: false, error: error.message };
    }
  };

  const handleDeleteTransaction = async (txId) => {
    try {
      await supabaseService.deleteTransaction(txId);
      await refreshData();
      return { success: true };
    } catch (error) {
      console.error("Failed to delete transaction:", error);
      throw error;
    }
  };

  return { handleSaveTransaction, handleDeleteTransaction };
};