// src/hooks/usePlayerManager.js
// Player CRUD. Now team-aware: new players get club_id and team_id.

import { supabaseService } from '../services/supabaseService';
import { validatePlayer } from '../utils/validation';

export const usePlayerManager = (refreshData, clubId = null, teamId = null) => {
  const handleSavePlayer = async (playerData) => {
    const validationError = validatePlayer(playerData);
    if (validationError) return { success: false, error: validationError };

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
      console.error('Player save failed:', error);
      return { success: false, error: error.message };
    }
  };

  const handleArchivePlayer = async (playerId) => {
    try {
      await supabaseService.updatePlayerField(playerId, 'status', 'archived');
      await refreshData();
      return { success: true };
    } catch (error) {
      console.error('Archive player failed:', error);
      return { success: false, error: error.message };
    }
  };

  const handleToggleWaiveFee = async (playerId, selectedSeason, currentState) => {
    try {
      await supabaseService.updateSeasonProfile(playerId, selectedSeason, { feeWaived: !currentState });
      await refreshData();
      return { success: true };
    } catch (error) {
      console.error('Toggle waive fee failed:', error);
      return { success: false, error: error.message };
    }
  };

  const handleToggleFundraiserBuyIn = async (playerId, selectedSeason, currentState) => {
    try {
      await supabaseService.updateSeasonProfile(playerId, selectedSeason, { fundraiserBuyIn: !currentState });
      await refreshData();
      return { success: true };
    } catch (error) {
      console.error('Toggle fundraiser buy-in failed:', error);
      return { success: false, error: error.message };
    }
  };

  return { handleSavePlayer, handleArchivePlayer, handleToggleWaiveFee, handleToggleFundraiserBuyIn };
};
