// src/hooks/useEventBudgetPush.js
//
// Wires the schedule's "Add to Budget" action to the season budget.
//
// The heavy lifting — what moves, by how much, and whether this is a re-push —
// lives in utils/eventBudgetPush and budgetService.pushEventToBudget. This hook
// only holds the team-season context those need, keeps the contribution list
// fresh so the modal can show what is already budgeted, and decides whether a
// push against a finalized budget is allowed to re-derive player fees.

import { useCallback, useEffect, useState } from 'react';
import { supabaseService } from '../services/supabaseService';
import { getSeasonHalf } from '../utils/eventBudgetPush';

// Whether pushing into a FINALIZED budget also re-derives the base fee is the
// team's call, set on the budget screen and stored per team-season. Teams that
// treat the finalized fee as a promise to families leave it off and absorb the
// overrun; teams that expect the roster to cover actual cost leave it on.
// Defaults to on, matching what the Amend Budget button has always done.
const recalcPolicyFor = (teamSeason) => teamSeason?.amendRecalculatesFee !== false;

export function useEventBudgetPush({ selectedSeason, currentTeamSeason, selectedTeamId, showToast, onDataChange, t }) {
  const [contributions, setContributions] = useState([]);
  const teamSeasonId = currentTeamSeason?.id || null;

  const refresh = useCallback(async () => {
    try {
      const rows = teamSeasonId ? await supabaseService.getContributionsForTeamSeason(teamSeasonId) : [];
      setContributions(rows);
    } catch (e) {
      // A missing table (migration not yet run) must not break the schedule.
      console.error('Load budget contributions failed:', e);
      setContributions([]);
    }
  }, [teamSeasonId]);

  useEffect(() => {
    let cancelled = false;
    // Guarded so a slow response for the previous team-season cannot land after
    // the user has already switched to another one.
    (async () => {
      try {
        const rows = teamSeasonId ? await supabaseService.getContributionsForTeamSeason(teamSeasonId) : [];
        if (!cancelled) setContributions(rows);
      } catch (e) {
        console.error('Load budget contributions failed:', e);
        if (!cancelled) setContributions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [teamSeasonId]);

  const pushEventToBudget = useCallback(
    async (dbEvent, linkedTransactions = []) => {
      if (!dbEvent || !teamSeasonId || !selectedSeason) {
        return { success: false, error: t ? t('expenses.budgetNoSeason') : 'No season budget available.' };
      }

      const expenses = linkedTransactions.filter((tx) => tx.category !== 'TRF');
      const half = getSeasonHalf(dbEvent.eventDate);
      const isFinalized = !!currentTeamSeason?.isFinalized;

      // Raw inputs, not a computed fee: the service derives the fee from the
      // post-push totals, which only it knows.
      const feeInputs = isFinalized
        ? {
            currentBaseFee: Number(currentTeamSeason?.baseFee) || 0,
            rosterSize: Number(currentTeamSeason?.expectedRosterSize) || 0,
            bufferPercent: Number(currentTeamSeason?.bufferPercent) || 0,
            carryoverAmount: Number(currentTeamSeason?.carryoverAmount) || 0,
          }
        : null;

      try {
        const result = await supabaseService.pushEventToBudget({
          seasonId: selectedSeason,
          teamSeasonId,
          teamId: selectedTeamId,
          eventId: dbEvent.id,
          expenses,
          half,
          isFinalized,
          recalculateBaseFee: recalcPolicyFor(currentTeamSeason),
          feeInputs,
        });

        await refresh();
        onDataChange?.();

        if (showToast && t) {
          // Same as the planner push: the budget moved, only the history row
          // did not, and saying "failed" here would invite a second push.
          if (result.amendmentError) showToast(t('planCosts.amendNotLogged'), true);
          else if (!result.applied) showToast(t('expenses.budgetNoChange'));
          else showToast(isFinalized ? t('expenses.budgetAmended') : t('expenses.budgetPushed'));
        }
        return { success: true, ...result };
      } catch (e) {
        console.error('Push event to budget failed:', e);
        const message = e?.message || (t ? t('expenses.budgetFailed') : 'Could not update the budget.');
        if (showToast) showToast(message, true);
        return { success: false, error: message };
      }
    },
    [teamSeasonId, selectedSeason, selectedTeamId, currentTeamSeason, refresh, onDataChange, showToast, t],
  );

  return { contributions, pushEventToBudget, refreshContributions: refresh };
}
