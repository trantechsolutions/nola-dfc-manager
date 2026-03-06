import { firebaseService } from '../services/firebaseService';
import { Timestamp } from 'firebase/firestore';

export const useLedgerManager = (refreshData, selectedSeason, handleWaterfallCredit) => {
  const handleSaveTransaction = async (txData) => {
    try {
      // Ensure date is properly converted to a Firestore Timestamp
      const formattedData = {
        ...txData,
        date: typeof txData.date === 'string' ? Timestamp.fromDate(new Date(`${txData.date}T12:00:00`)) : txData.date
      };

      if (formattedData.id) {
        await firebaseService.updateDocument('transactions', formattedData.id, formattedData);
      } else {
        // AUTOMATED WATERFALL: If category is Fundraising (FUN), trigger waterfall immediately
        if (formattedData.category === 'FUN' && formattedData.playerId) {
          await handleWaterfallCredit(formattedData.amount, formattedData.title, formattedData.playerId);
        } else {
          await firebaseService.addDocument('transactions', { ...formattedData, seasonId: selectedSeason });
        }
      }
      await refreshData();
    } catch (error) {
      console.error("Transaction save failed:", error);
    }
  };

  const handleDeleteTransaction = async (txId) => {
    if (window.confirm("Are you sure you want to delete this transaction?")) {
      await firebaseService.deleteDocument('transactions', txId);
      await refreshData();
    }
  };

  return { handleSaveTransaction, handleDeleteTransaction };
};