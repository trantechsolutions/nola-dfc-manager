import { supabaseService } from '../services/supabaseService';

export const usePlayerManager = (refreshData) => {
  const handleSavePlayer = async (playerData) => {
    try {
      if (playerData.id) {
        await supabaseService.updatePlayer(playerData.id, playerData);
      } else {
        await supabaseService.addPlayer({ ...playerData, status: 'active' });
      }
      await refreshData();
      return { success: true };
    } catch (error) {
      console.error("Player save failed:", error);
      return { success: false, error };
    }
  };

  const handleArchivePlayer = async (playerId) => {
    if (window.confirm("Archive this player? This will remove them from the active roster.")) {
      await supabaseService.updatePlayerField(playerId, 'status', 'archived');
      await refreshData();
    }
  };

  const handleToggleWaiveFee = async (playerId, selectedSeason, currentState) => {
    try {
      await supabaseService.updateSeasonProfile(playerId, selectedSeason, { feeWaived: !currentState });
      await refreshData();
    } catch (error) {
      console.error("Toggle waive fee failed:", error);
    }
  };

  return { handleSavePlayer, handleArchivePlayer, handleToggleWaiveFee };
};