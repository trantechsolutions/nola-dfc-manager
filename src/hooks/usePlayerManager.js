// src/hooks/usePlayerManager.js
// Player CRUD. Now team-aware: new players get club_id and team_id.

import { supabaseService } from '../services/supabaseService';

export const usePlayerManager = (refreshData, clubId = null, teamId = null) => {
  const handleSavePlayer = async (playerData) => {
    try {
      if (playerData.id) {
        await supabaseService.updatePlayer(playerData.id, playerData);
      } else {
        // New players get scoped to the current club and team
        await supabaseService.addPlayer({ 
          ...playerData, 
          status: 'active',
          ...(clubId ? { clubId } : {}),
          ...(teamId ? { teamId } : {}),
        });
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