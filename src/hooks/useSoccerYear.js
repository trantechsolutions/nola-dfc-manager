// src/hooks/useSoccerYear.js
// Manages seasons and team-seasons.
//
// SCHEMA REALITY:
//   seasons table:      only has id, name, created_at, updated_at
//   team_seasons table: has ALL budget fields (base_fee, buffer_percent, 
//                       expected_roster_size, total_projected_expenses,
//                       total_projected_income, is_finalized)
//
// So currentSeasonData gets everything from team_seasons. No merge needed.

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
        data.push({ id: '2025-2026' });
      }
      data.sort((a, b) => b.id.localeCompare(a.id));
      setSeasons(data);

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

  // Find the team_season for the selected season
  const currentTeamSeason = useMemo(() => 
    teamSeasons.find(ts => ts.seasonId === selectedSeason) || null,
  [teamSeasons, selectedSeason]);

  // Build currentSeasonData — team_seasons is the ONLY source for budget fields
  const currentSeasonData = useMemo(() => {
    if (currentTeamSeason) {
      return {
        id: selectedSeason,
        teamSeasonId: currentTeamSeason.id,
        isFinalized: currentTeamSeason.isFinalized,
        // calculatedBaseFee is what useFinance + Dashboard read for the live fee
        calculatedBaseFee: currentTeamSeason.baseFee,
        bufferPercent: currentTeamSeason.bufferPercent ?? 5,
        expectedRosterSize: currentTeamSeason.expectedRosterSize,
        totalProjectedExpenses: currentTeamSeason.totalProjectedExpenses,
        totalProjectedIncome: currentTeamSeason.totalProjectedIncome,
      };
    }
    // No team_season exists yet — return bare minimum
    return {
      id: selectedSeason,
      isFinalized: false,
      calculatedBaseFee: 0,
      bufferPercent: 5,
      expectedRosterSize: null,
      totalProjectedExpenses: null,
      totalProjectedIncome: null,
    };
  }, [currentTeamSeason, selectedSeason]);

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