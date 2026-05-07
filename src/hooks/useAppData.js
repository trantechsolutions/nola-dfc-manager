import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { supabaseService } from '../services/supabaseService';

/**
 * Owns all server-fetched data state: players, transactions, playerFinancials,
 * teamEvents. Exposes fetchData so callers can trigger a refresh after mutations.
 *
 * Extracted from App.jsx to keep the root component focused on layout and auth.
 */
export function useAppData({
  userEmail,
  selectedTeamId,
  parentTeamId,
  selectedSeason,
  setSelectedSeason,
  currentTeamSeason,
  teamSeasons,
}) {
  const [players, setPlayers] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [playerFinancials, setPlayerFinancials] = useState({});
  const [teamEvents, setTeamEvents] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchIdRef = useRef(0);

  const fetchData = useCallback(
    async (seasonOverride) => {
      const fetchId = ++fetchIdRef.current;
      try {
        let fetchTeamId = selectedTeamId || parentTeamId;

        let pData = [];
        let resolvedSeason = seasonOverride || selectedSeason;

        if (!fetchTeamId) {
          try {
            if (userEmail) {
              pData = await supabaseService.getPlayersByGuardianEmail(userEmail);
              if (pData.length > 0 && pData[0].teamId) {
                fetchTeamId = pData[0].teamId;
              }
              if (pData.length > 0 && !resolvedSeason) {
                const profiles = pData[0].seasonProfiles || {};
                const enrolledSeasons = Object.keys(profiles).sort((a, b) => b.localeCompare(a));
                if (enrolledSeasons.length > 0) {
                  resolvedSeason = enrolledSeasons[0];
                  setSelectedSeason(resolvedSeason);
                }
              }
            }
          } catch (e) {
            console.warn('Guardian email lookup failed:', e.message);
          }
        }

        if (fetchTeamId && pData.length === 0) {
          pData = await supabaseService.getPlayersByTeam(fetchTeamId);
        }

        console.log('Fetched', pData.length, 'players for teamId:', fetchTeamId, 'season:', resolvedSeason);

        let tsId = currentTeamSeason?.id || null;
        if (!tsId && fetchTeamId && resolvedSeason) {
          const match = teamSeasons?.find((ts) => ts.seasonId === resolvedSeason);
          tsId = match?.id || null;
        }
        if (!tsId && fetchTeamId && resolvedSeason) {
          try {
            const ts = await supabaseService.getTeamSeason(fetchTeamId, resolvedSeason);
            tsId = ts?.id || null;
          } catch {
            /* noop */
          }
        }

        const tData = tsId ? await supabaseService.getTransactionsByTeamSeason(tsId) : [];

        let fData = {};
        try {
          fData = await supabaseService.getPlayerFinancials(resolvedSeason, tsId);
        } catch (e) {
          console.warn('Could not fetch player_financials view:', e.message);
        }

        const evId = fetchTeamId || selectedTeamId || parentTeamId;
        if (evId) {
          try {
            const evData = await supabaseService.getTeamEvents(evId);
            setTeamEvents(evData);
          } catch (e) {
            console.warn('Could not fetch team events:', e.message);
          }
        }

        if (fetchId !== fetchIdRef.current) return;

        setPlayers(pData);
        setTransactions(tData);
        setPlayerFinancials(fData);
      } catch (e) {
        console.error('Data fetch error', e);
      } finally {
        if (fetchId === fetchIdRef.current) setLoading(false);
      }
    },
    [userEmail, selectedTeamId, parentTeamId, selectedSeason, currentTeamSeason?.id, teamSeasons],
  );

  // Refresh financials independently when team-season resolves
  useEffect(() => {
    if (!selectedSeason) return;
    const tsId = currentTeamSeason?.id || null;
    supabaseService
      .getPlayerFinancials(selectedSeason, tsId)
      .then((fData) => setPlayerFinancials(fData || {}))
      .catch((e) => {
        console.warn('Financials refresh failed:', e.message);
        setPlayerFinancials({});
      });
  }, [currentTeamSeason?.id, selectedSeason]);

  const updateTeamEvent = (dbEventId, updates) => {
    setTeamEvents((prev) => prev.map((e) => (e.id === dbEventId ? { ...e, ...updates } : e)));
  };

  const refreshTeamEvents = async (teamId) => {
    if (!teamId) return;
    try {
      const evData = await supabaseService.getTeamEvents(teamId);
      setTeamEvents(evData);
    } catch (e) {
      console.warn('Could not refresh team events:', e.message);
    }
  };

  // Collapse same-title tournament entries into single dropdown options
  const collapsedTeamEvents = useMemo(() => {
    const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
    const tournaments = teamEvents.filter((e) => e.eventType === 'tournament');
    const others = teamEvents.filter((e) => e.eventType !== 'tournament');

    const sorted = [...tournaments].sort((a, b) => new Date(a.eventDate) - new Date(b.eventDate));
    const used = new Set();
    const grouped = [];

    for (let i = 0; i < sorted.length; i++) {
      if (used.has(i)) continue;
      const anchor = sorted[i];
      const anchorMs = new Date(anchor.eventDate).getTime();
      const group = [anchor];
      used.add(i);

      for (let j = i + 1; j < sorted.length; j++) {
        if (used.has(j)) continue;
        const candidate = sorted[j];
        if (candidate.title === anchor.title && new Date(candidate.eventDate).getTime() - anchorMs <= THREE_DAYS_MS) {
          group.push(candidate);
          used.add(j);
        }
      }

      if (group.length === 1) {
        grouped.push(anchor);
      } else {
        const last = group[group.length - 1];
        grouped.push({ ...anchor, description: `${group.length} games · ${anchor.eventDate} – ${last.eventDate}` });
      }
    }

    return [...others, ...grouped].sort((a, b) => new Date(b.eventDate) - new Date(a.eventDate));
  }, [teamEvents]);

  return {
    players,
    setPlayers,
    transactions,
    playerFinancials,
    teamEvents,
    collapsedTeamEvents,
    loading,
    setLoading,
    fetchData,
    updateTeamEvent,
    refreshTeamEvents,
  };
}
