// src/hooks/useSoccerYear.js
// Manages seasons and team-seasons.
//
// CRITICAL: team_seasons is the authoritative source for budget data per team.
// The global seasons table is a fallback for shared metadata only.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabaseService } from '../services/supabaseService';

export const useSoccerYear = (user, teamId = null) => {
  const [seasons, setSeasons] = useState([]);
  const [teamSeasons, setTeamSeasons] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState('2025-2026');
  const [loading, setLoading] = useState(true);

  // ── Fetch seasons + team seasons ──
  const fetchSeasons = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // 1. Global seasons (for the season list/dropdown)
      const data = await supabaseService.getAllSeasons();
      if (!data.find(s => s.id === '2025-2026')) {
        data.push({ id: '2025-2026', isFinalized: false });
      }
      data.sort((a, b) => b.id.localeCompare(a.id));
      setSeasons(data);

      // 2. Team seasons (budget data lives here)
      if (teamId) {
        const tsData = await supabaseService.getTeamSeasons(teamId);
        console.log('[useSoccerYear] teamId:', teamId, '| team_seasons:', tsData);
        setTeamSeasons(tsData);
      } else {
        console.log('[useSoccerYear] No teamId — clearing teamSeasons');
        setTeamSeasons([]);
      }
    } catch (error) {
      console.error('[useSoccerYear] Fetch failed:', error);
    } finally {
      setLoading(false);
    }
  }, [user, teamId]);

  useEffect(() => {
    fetchSeasons();
  }, [fetchSeasons]);

  // ── Current team season for the selected season ──
  const currentTeamSeason = useMemo(() => {
    const match = teamSeasons.find(ts => ts.seasonId === selectedSeason) || null;
    console.log('[useSoccerYear] selectedSeason:', selectedSeason, '| currentTeamSeason:', match);
    return match;
  }, [teamSeasons, selectedSeason]);

  // ── Merged season data ──
  // PRIORITY: team_seasons values WIN over global seasons values.
  // The global seasons table may have stale/duplicated data from legacy saves.
  // team_seasons is the per-team authoritative source.
  const currentSeasonData = useMemo(() => {
    const globalSeason = seasons.find(s => s.id === selectedSeason) || {};

    if (currentTeamSeason) {
      const merged = {
        id: selectedSeason,
        name: globalSeason.name || selectedSeason,
        teamSeasonId: currentTeamSeason.id,

        // ── Finalization: ONLY from team_seasons ──
        isFinalized: currentTeamSeason.isFinalized || false,

        // ── Budget numbers: team_seasons is authoritative ──
        // Use team_season value first. Only fall back to global if team_season is null.
        baseFee: currentTeamSeason.baseFee ?? 0,
        calculatedBaseFee: currentTeamSeason.baseFee || globalSeason.calculatedBaseFee || 0,
        bufferPercent: currentTeamSeason.bufferPercent ?? globalSeason.bufferPercent ?? 5,
        expectedRosterSize: currentTeamSeason.expectedRosterSize ?? globalSeason.expectedRosterSize ?? null,
        totalProjectedExpenses: currentTeamSeason.totalProjectedExpenses ?? globalSeason.totalProjectedExpenses ?? null,
        totalProjectedIncome: currentTeamSeason.totalProjectedIncome ?? globalSeason.totalProjectedIncome ?? null,
      };
      console.log('[useSoccerYear] currentSeasonData (merged):', merged);
      return merged;
    }

    // No team season — return global with safe defaults
    const fallback = {
      ...globalSeason,
      id: selectedSeason,
      teamSeasonId: null,
      isFinalized: globalSeason.isFinalized || false,
    };
    console.log('[useSoccerYear] currentSeasonData (global fallback):', fallback);
    return fallback;
  }, [seasons, currentTeamSeason, selectedSeason]);

  return {
    seasons,
    teamSeasons,
    selectedSeason,
    setSelectedSeason,
    currentSeasonData,
    currentTeamSeason,
    refreshSeasons: fetchSeasons,
    loading,
  };
};