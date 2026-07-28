// src/hooks/useMatchups.js
// Fetches and manages Matchup rows (inter-team scheduling negotiation) for a
// team + season. Separate from useSchedule.js because a matchup's status
// churns constantly while a game is being arranged, while useSchedule's
// team_events are the real, confirmed schedule — see matchupService.js for
// how the two get linked on confirmation.

import { useState, useEffect, useCallback } from 'react';
import { supabaseService } from '../services/supabaseService';

export const useMatchups = (team = null, seasonId = null) => {
  const [matchups, setMatchups] = useState([]);
  const [loading, setLoading] = useState(true);

  const refreshMatchups = useCallback(async () => {
    if (!team?.id || !seasonId) {
      setMatchups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await supabaseService.getMatchups(team.id, seasonId);
      setMatchups(rows);
    } catch (err) {
      console.error('Failed to load matchups:', err.message);
      setMatchups([]);
    } finally {
      setLoading(false);
    }
  }, [team?.id, seasonId]);

  useEffect(() => {
    refreshMatchups();
  }, [refreshMatchups]);

  const createMatchup = useCallback(
    async (matchupData) => {
      const created = await supabaseService.createMatchup({ teamId: team.id, seasonId, ...matchupData });
      setMatchups((prev) => [...prev, created]);
      return created;
    },
    [team?.id, seasonId],
  );

  const updateMatchup = useCallback(async (id, updates) => {
    const updated = await supabaseService.updateMatchup(id, updates);
    setMatchups((prev) => prev.map((m) => (m.id === id ? updated : m)));
    return updated;
  }, []);

  const deleteMatchup = useCallback(async (id) => {
    await supabaseService.deleteMatchup(id);
    setMatchups((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const duplicateMatchup = useCallback(async (matchup) => {
    const created = await supabaseService.duplicateMatchup(matchup);
    setMatchups((prev) => [...prev, created]);
    return created;
  }, []);

  const setMatchupStatus = useCallback(async (matchup, newStatus) => {
    const updated = await supabaseService.setMatchupStatus(matchup, newStatus);
    setMatchups((prev) => prev.map((m) => (m.id === matchup.id ? updated : m)));
    return updated;
  }, []);

  const confirmMatchup = useCallback(async (matchup, opts) => {
    const updated = await supabaseService.confirmMatchup(matchup, opts);
    setMatchups((prev) => prev.map((m) => (m.id === matchup.id ? updated : m)));
    return updated;
  }, []);

  const rescheduleMatchup = useCallback(async (matchup) => {
    const created = await supabaseService.rescheduleMatchup(matchup);
    setMatchups((prev) => [...prev.map((m) => (m.id === matchup.id ? { ...m, status: 'cancelled' } : m)), created]);
    return created;
  }, []);

  return {
    matchups,
    loading,
    refreshMatchups,
    createMatchup,
    updateMatchup,
    deleteMatchup,
    duplicateMatchup,
    setMatchupStatus,
    confirmMatchup,
    rescheduleMatchup,
  };
};
