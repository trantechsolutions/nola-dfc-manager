// src/hooks/useSoccerYear.js
// ──────────────────────────────────────────────────────────────────────
// Manages seasons and team-seasons. 
// 
// SCHEMA FIX: The `seasons` table only has id + name.
// All budget metadata (isFinalized, baseFee, bufferPercent, etc.)
// lives on `team_seasons`. This hook no longer reads ghost columns
// from seasons and builds currentSeasonData purely from team_seasons.
// ──────────────────────────────────────────────────────────────────────

import { useState, useEffect, useMemo } from 'react';
import { supabaseService } from '../services/supabaseService';

export const useSoccerYear = (user, teamId = null) => {
  const [seasons, setSeasons] = useState([]);
  const [teamSeasons, setTeamSeasons] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState('2025-2026');
  const [loading, setLoading] = useState(true);

  const fetchSeasons = async () => {
    setLoading(true);
    try {
      // seasons table only returns { id, name }
      const data = await supabaseService.getAllSeasons();
      if (!data.find(s => s.id === '2025-2026')) {
        data.push({ id: '2025-2026', name: '2025-2026' });
      }
      data.sort((a, b) => b.id.localeCompare(a.id));
      setSeasons(data);

      // Fetch team-specific season data (where budget metadata lives)
      if (teamId) {
        const tsData = await supabaseService.getTeamSeasons(teamId);
        setTeamSeasons(tsData);
      } else {
        setTeamSeasons([]);
      }
    } catch (error) {
      console.error("Season fetch failed", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchSeasons();
  }, [user, teamId]);

  // The team_season record for the currently selected season + team
  const currentTeamSeason = useMemo(() =>
    teamSeasons.find(ts => ts.seasonId === selectedSeason) || null,
  [teamSeasons, selectedSeason]);

  // Unified season data object consumed by components.
  // ALL budget fields come from team_seasons — seasons table only provides id/name.
  const currentSeasonData = useMemo(() => {
    const base = seasons.find(s => s.id === selectedSeason) || { id: selectedSeason, name: selectedSeason };

    if (currentTeamSeason) {
      return {
        id: selectedSeason,
        name: base.name,
        teamSeasonId: currentTeamSeason.id,
        isFinalized: currentTeamSeason.isFinalized,
        baseFee: currentTeamSeason.baseFee,
        calculatedBaseFee: currentTeamSeason.baseFee,
        bufferPercent: currentTeamSeason.bufferPercent,
        expectedRosterSize: currentTeamSeason.expectedRosterSize,
        totalProjectedExpenses: currentTeamSeason.totalProjectedExpenses,
        totalProjectedIncome: currentTeamSeason.totalProjectedIncome,
      };
    }

    // No team_season yet — return minimal object (budget not set up)
    return {
      id: selectedSeason,
      name: base.name,
      teamSeasonId: null,
      isFinalized: false,
      baseFee: 0,
      calculatedBaseFee: null,
      bufferPercent: 5,
      expectedRosterSize: null,
      totalProjectedExpenses: null,
      totalProjectedIncome: null,
    };
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