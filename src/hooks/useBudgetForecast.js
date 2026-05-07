import { useState, useCallback, useRef } from 'react';
import { supabaseService } from '../services/supabaseService';
import { prepareHistoricalData, generateForecast, compareForecastToBudget } from '../utils/budgetModel';

/**
 * Hook for budget forecasting using internal statistical model.
 *
 * Historical data is cached in a ref keyed to teamId — re-runs with different
 * roster sizes skip the network round-trip. Pass { forceRefresh: true } to
 * bust the cache (e.g. after saving new budget items or transactions).
 *
 * @param {string} teamId
 * @param {Object[]} teamSeasons - All team_season records for this team
 * @returns {Object} Forecast state and actions
 */
export function useBudgetForecast(teamId, teamSeasons) {
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Cache: { teamId, budgetItems, transactions }
  const dataCache = useRef(null);

  // Stable key derived from team season IDs — prevents unnecessary callback
  // re-creation when the teamSeasons array reference changes on parent re-renders.
  const teamSeasonsKey = teamSeasons.map((ts) => ts.id).join(',');

  // Keep a ref to teamSeasons so runForecast always sees the current value
  // without needing it in the dependency array.
  const teamSeasonsRef = useRef(teamSeasons);
  teamSeasonsRef.current = teamSeasons;

  const runForecast = useCallback(
    async (targetRosterSize, currentBudgetItems, { forceRefresh = false } = {}) => {
      const currentTeamSeasons = teamSeasonsRef.current;
      if (!teamId || currentTeamSeasons.length === 0) {
        setError('Need at least one season of data to forecast.');
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        // Only fetch when cache is cold, stale (different teamId), or refresh forced
        if (forceRefresh || !dataCache.current || dataCache.current.teamId !== teamId) {
          const [allBudgetItems, allTransactions] = await Promise.all([
            supabaseService.getAllBudgetItemsForTeam(teamId),
            supabaseService.getAllTransactionsForTeam(teamId),
          ]);
          dataCache.current = { teamId, allBudgetItems, allTransactions };
        }

        const { allBudgetItems, allTransactions } = dataCache.current;
        const historical = prepareHistoricalData(allBudgetItems, allTransactions, currentTeamSeasons);
        const result = generateForecast(historical, targetRosterSize);

        if (currentBudgetItems?.length > 0) {
          result.comparison = compareForecastToBudget(result.forecast, currentBudgetItems);
        }

        setForecast(result);
        return result;
      } catch (err) {
        setError(err.message);
        return null;
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [teamId, teamSeasonsKey],
  );

  const clearForecast = useCallback(() => {
    setForecast(null);
    setError(null);
  }, []);

  const invalidateCache = useCallback(() => {
    dataCache.current = null;
  }, []);

  return { forecast, loading, error, runForecast, clearForecast, invalidateCache };
}
