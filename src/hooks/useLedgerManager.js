import { supabaseService } from '../services/supabaseService';

export const useLedgerManager = (refreshData, selectedSeason) => {
  const handleSaveTransaction = async (txData) => {
    try {
      // Normalize the date to a YYYY-MM-DD string
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