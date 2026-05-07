// src/hooks/usePlayerManager.js
// Player CRUD. Now team-aware: new players get club_id and team_id.
// Optimistic updates: local state is updated immediately and rolled back on error.

import { supabaseService } from '../services/supabaseService';
import { validatePlayer } from '../utils/validation';

export const usePlayerManager = (refreshData, clubId = null, teamId = null, setPlayers = null) => {
  const handleSavePlayer = async (playerData) => {
    const validationError = validatePlayer(playerData);
    if (validationError) return { success: false, error: validationError };

    try {
      // Optimistic update for edits only (adds need a server-generated id)
      if (setPlayers && playerData.id) {
        setPlayers((prev) => prev.map((p) => (p.id === playerData.id ? { ...p, ...playerData } : p)));
      }

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
      // Rollback by re-fetching on failure
      if (setPlayers) await refreshData();
      console.error('Player save failed:', error);
      return { success: false, error: error.message };
    }
  };

  const handleArchivePlayer = async (playerId) => {
    let snapshot = null;
    try {
      if (setPlayers) {
        setPlayers((prev) => {
          snapshot = prev;
          return prev.map((p) => (p.id === playerId ? { ...p, status: 'archived' } : p));
        });
      }

      await supabaseService.updatePlayerField(playerId, 'status', 'archived');
      await refreshData();
      return { success: true };
    } catch (error) {
      if (setPlayers && snapshot) setPlayers(snapshot);
      console.error('Archive player failed:', error);
      return { success: false, error: error.message };
    }
  };

  const handleToggleWaiveFee = async (playerId, selectedSeason, currentState) => {
    try {
      // Optimistic update on the seasonProfiles map
      if (setPlayers) {
        setPlayers((prev) =>
          prev.map((p) =>
            p.id === playerId
              ? {
                  ...p,
                  seasonProfiles: {
                    ...p.seasonProfiles,
                    [selectedSeason]: { ...p.seasonProfiles?.[selectedSeason], feeWaived: !currentState },
                  },
                }
              : p,
          ),
        );
      }

      await supabaseService.updateSeasonProfile(playerId, selectedSeason, { feeWaived: !currentState });
      await refreshData();
      return { success: true };
    } catch (error) {
      if (setPlayers) await refreshData();
      console.error('Toggle waive fee failed:', error);
      return { success: false, error: error.message };
    }
  };

  const handleToggleFundraiserBuyIn = async (playerId, selectedSeason, currentState) => {
    try {
      if (setPlayers) {
        setPlayers((prev) =>
          prev.map((p) =>
            p.id === playerId
              ? {
                  ...p,
                  seasonProfiles: {
                    ...p.seasonProfiles,
                    [selectedSeason]: { ...p.seasonProfiles?.[selectedSeason], fundraiserBuyIn: !currentState },
                  },
                }
              : p,
          ),
        );
      }

      await supabaseService.updateSeasonProfile(playerId, selectedSeason, { fundraiserBuyIn: !currentState });
      await refreshData();
      return { success: true };
    } catch (error) {
      if (setPlayers) await refreshData();
      console.error('Toggle fundraiser buy-in failed:', error);
      return { success: false, error: error.message };
    }
  };

  return { handleSavePlayer, handleArchivePlayer, handleToggleWaiveFee, handleToggleFundraiserBuyIn };
};
