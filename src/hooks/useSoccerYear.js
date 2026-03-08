import { useState, useEffect } from 'react';
import { supabaseService } from '../services/supabaseService';

export const useSoccerYear = (user) => {
  const [seasons, setSeasons] = useState([]);
  const [selectedSeason, setSelectedSeason] = useState('2025-2026');
  const [loading, setLoading] = useState(true);

  const fetchSeasons = async () => {
    setLoading(true);
    try {
      const data = await supabaseService.getAllSeasons();
      // Ensure 2025-2026 is always present
      if (!data.find(s => s.id === '2025-2026')) {
        data.push({ id: '2025-2026', isFinalized: false });
      }
      data.sort((a, b) => b.id.localeCompare(a.id));
      setSeasons(data);
    } catch (error) {
      console.error("Season fetch failed", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) fetchSeasons();
  }, [user]);

  const currentSeasonData = seasons.find(s => s.id === selectedSeason) || {};

  return {
    seasons,
    selectedSeason,
    setSelectedSeason,
    currentSeasonData,
    refreshSeasons: fetchSeasons,
    loading
  };
};