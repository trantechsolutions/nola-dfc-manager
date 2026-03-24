import { useState, useCallback } from 'react';
import { supabaseService } from '../services/supabaseService';
import { prepareHistoricalData, generateForecast, compareForecastToBudget } from '../utils/budgetModel';

/**
 * Hook for budget forecasting using internal statistical model.
 *
 * @param {string} teamId
 * @param {Object[]} teamSeasons - All team_season records for this team
 * @returns {Object} Forecast state and actions
 */
export function useBudgetForecast(teamId, teamSeasons) {
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const runForecast = useCallback(
    async (targetRosterSize, currentBudgetItems) => {
      if (!teamId || teamSeasons.length === 0) {
        setError('Need at least one season of data to forecast.');
        return null;
      }

      setLoading(true);
      setError(null);

      try {
        // Fetch all historical data in parallel
        const [allBudgetItems, allTransactions] = await Promise.all([
          supabaseService.getAllBudgetItemsForTeam(teamId),
          supabaseService.getAllTransactionsForTeam(teamId),
        ]);

        // Prepare and run forecast
        const historical = prepareHistoricalData(allBudgetItems, allTransactions, teamSeasons);
        const result = generateForecast(historical, targetRosterSize);

        // If current budget provided, add comparison
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
    [teamId, teamSeasons],
  );

  const clearForecast = useCallback(() => {
    setForecast(null);
    setError(null);
  }, []);

  return { forecast, loading, error, runForecast, clearForecast };
}
