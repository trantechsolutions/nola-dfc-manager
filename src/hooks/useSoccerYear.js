// src/hooks/useSoccerYear.js
//
// Seasons table = simple registry of season names (managed by club admins).
// Team_seasons table = all budget data per team per season.
// The team fee is DERIVED from team_season ingredients, never stored.

import { useState, useEffect, useMemo } from 'react';
import { supabaseService } from '../services/supabaseService';
import { calculateTeamFeeFromSeason } from '../utils/feeCalculator';

export const useSoccerYear = (user, teamId = null) => {
  const [seasons, setSeasons] = useState([]);
  const [teamSeasons, setTeamSeasons] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState('2025-2026');
  const [loading, setLoading] = useState(true);

  const fetchSeasons = async () => {
    setLoading(true);
    try {
      // Seasons = just a list of names (e.g., "2025-2026")
      const data = await supabaseService.getAllSeasons();
      if (!data.find(s => s.id === '2025-2026')) {
        data.push({ id: '2025-2026', name: '2025-2026' });
      }
      data.sort((a, b) => b.id.localeCompare(a.id));
      setSeasons(data);

      // Team_seasons = all budget data per team
      if (teamId) {
        const tsData = await supabaseService.getTeamSeasons(teamId);
        setTeamSeasons(tsData);
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

  const currentTeamSeason = useMemo(() => 
    teamSeasons.find(ts => ts.seasonId === selectedSeason) || null,
  [teamSeasons, selectedSeason]);

  const currentSeasonData = useMemo(() => {
    // Base: just the season name from the registry
    const base = { id: selectedSeason, name: selectedSeason };

    if (currentTeamSeason) {
      // Team_season is the ONLY source of budget data.
      // Fee is derived from ingredients, never stored.
      return {
        ...base,
        teamSeasonId: currentTeamSeason.id,
        isFinalized: currentTeamSeason.isFinalized,
        calculatedBaseFee: calculateTeamFeeFromSeason(currentTeamSeason),
        bufferPercent: currentTeamSeason.bufferPercent ?? 5,
        expectedRosterSize: currentTeamSeason.expectedRosterSize ?? 0,
        totalProjectedExpenses: currentTeamSeason.totalProjectedExpenses ?? 0,
        totalProjectedIncome: currentTeamSeason.totalProjectedIncome ?? 0,
      };
    }

    // No team_season yet — return empty budget state
    return { ...base, isFinalized: false, calculatedBaseFee: 0, bufferPercent: 5, expectedRosterSize: 0, totalProjectedExpenses: 0, totalProjectedIncome: 0 };
  }, [seasons, currentTeamSeason, selectedSeason]);

  return {
    seasons,
    teamSeasons,
    selectedSeason,
    setSelectedSeason,
    currentSeasonData,
    currentTeamSeason,
    refreshSeasons: fetchSeasons,
    loading
  };
};