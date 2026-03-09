// src/hooks/useSoccerYear.js
// Manages seasons and team-seasons. When a teamId is provided,
// also fetches team_seasons for that team.

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
      const data = await supabaseService.getAllSeasons();
      if (!data.find(s => s.id === '2025-2026')) {
        data.push({ id: '2025-2026', isFinalized: false });
      }
      data.sort((a, b) => b.id.localeCompare(a.id));
      setSeasons(data);

      // If team is selected, also fetch team-seasons
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

  // Current season data — prefer team_season if available, fall back to global season
  const currentTeamSeason = useMemo(() => 
    teamSeasons.find(ts => ts.seasonId === selectedSeason) || null,
  [teamSeasons, selectedSeason]);

  const currentSeasonData = useMemo(() => {
    const globalSeason = seasons.find(s => s.id === selectedSeason) || {};
    if (currentTeamSeason) {
      // Merge team_season data over global season
      // IMPORTANT: calculatedBaseFee comes from the seasons table (updated on every draft save).
      // team_season.baseFee is only set on finalization. Prefer the season-level value 
      // so the dashboard reflects the live draft fee.
      return {
        ...globalSeason,
        id: selectedSeason,
        teamSeasonId: currentTeamSeason.id,
        isFinalized: currentTeamSeason.isFinalized,
        calculatedBaseFee: globalSeason.calculatedBaseFee || currentTeamSeason.baseFee,
        bufferPercent: currentTeamSeason.bufferPercent ?? globalSeason.bufferPercent,
        expectedRosterSize: currentTeamSeason.expectedRosterSize ?? globalSeason.expectedRosterSize,
        totalProjectedExpenses: globalSeason.totalProjectedExpenses ?? currentTeamSeason.totalProjectedExpenses,
        totalProjectedIncome: globalSeason.totalProjectedIncome ?? currentTeamSeason.totalProjectedIncome,
      };
    }
    return globalSeason;
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