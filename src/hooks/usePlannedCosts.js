// src/hooks/usePlannedCosts.js
//
// The planner's expected-cost layer: what each matchup is forecast to cost, and
// how much of that forecast is currently sitting in the season budget.
//
// Held above both screens that need it — the planner enters the estimates, the
// budget screen shows and applies them — so the two never disagree about what
// has already been pushed. The arithmetic itself lives in
// utils/plannedCostBudget; the writes live in matchupService/budgetService.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabaseService } from '../services/supabaseService';
import { buildPlannedEntries, summarizePlannedCosts, isCostBudgeted } from '../utils/plannedCostBudget';

// Whether pushing into a FINALIZED budget also re-derives the base fee is the
// team's call, set on the budget screen and stored per team-season — the same
// policy the event push honours.
const recalcPolicyFor = (teamSeason) => teamSeason?.amendRecalculatesFee !== false;

export function usePlannedCosts({
  team,
  selectedSeason,
  currentTeamSeason,
  matchups = [],
  eventContributions = [],
  showToast,
  onDataChange,
  t,
}) {
  const [plannedCosts, setPlannedCosts] = useState([]);
  const [planContributions, setPlanContributions] = useState([]);
  const [loading, setLoading] = useState(false);

  const teamId = team?.id || null;
  const teamSeasonId = currentTeamSeason?.id || null;

  const loadCosts = useCallback(async () => {
    if (!teamId || !selectedSeason) {
      setPlannedCosts([]);
      return;
    }
    try {
      setPlannedCosts(await supabaseService.getPlannedCosts(teamId, selectedSeason));
    } catch (e) {
      // A missing table (migration not yet run) must not break the planner.
      console.error('Load planned costs failed:', e);
      setPlannedCosts([]);
    }
  }, [teamId, selectedSeason]);

  const loadContributions = useCallback(async () => {
    if (!teamSeasonId) {
      setPlanContributions([]);
      return;
    }
    try {
      setPlanContributions(await supabaseService.getPlanContributions(teamSeasonId));
    } catch (e) {
      console.error('Load plan contributions failed:', e);
      setPlanContributions([]);
    }
  }, [teamSeasonId]);

  useEffect(() => {
    let cancelled = false;
    // Guarded so a slow response for the previous team/season cannot land after
    // the user has already switched away from it.
    (async () => {
      setLoading(true);
      const [costs, contribs] = await Promise.all([
        teamId && selectedSeason
          ? supabaseService.getPlannedCosts(teamId, selectedSeason).catch((e) => {
              console.error('Load planned costs failed:', e);
              return [];
            })
          : Promise.resolve([]),
        teamSeasonId
          ? supabaseService.getPlanContributions(teamSeasonId).catch((e) => {
              console.error('Load plan contributions failed:', e);
              return [];
            })
          : Promise.resolve([]),
      ]);
      if (cancelled) return;
      setPlannedCosts(costs);
      setPlanContributions(contribs);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [teamId, selectedSeason, teamSeasonId]);

  const addPlannedCost = useCallback(async (matchupId, cost) => {
    const created = await supabaseService.createPlannedCost({ matchupId, ...cost });
    setPlannedCosts((prev) => [...prev, created]);
    return created;
  }, []);

  const updatePlannedCost = useCallback(async (id, updates) => {
    const updated = await supabaseService.updatePlannedCost(id, updates);
    setPlannedCosts((prev) => prev.map((c) => (c.id === id ? updated : c)));
    return updated;
  }, []);

  const deletePlannedCost = useCallback(async (id) => {
    await supabaseService.deletePlannedCost(id);
    setPlannedCosts((prev) => prev.filter((c) => c.id !== id));
  }, []);

  /**
   * File a budgeted estimate in the ledger as a pending expense.
   *
   * Refuses anything the budget has not seen: a cost that was never pushed has
   * no fee behind it, so putting it on the books would quietly overspend the
   * season. The row lands uncleared — it shows in the ledger as unpaid until
   * the treasurer approves it by hand.
   */
  const sendCostToLedger = useCallback(
    async (cost, matchup) => {
      if (cost?.ledgerTxId) {
        return { success: false, error: t ? t('planCosts.alreadyInLedger') : 'Already in the ledger.' };
      }
      if (!isCostBudgeted(cost, matchup, planContributions)) {
        return { success: false, error: t ? t('planCosts.needsBudgetFirst') : 'Add this to the budget first.' };
      }

      const opponent = matchup?.opponentName?.trim();
      const base = cost.label?.trim() || (t ? t('planCosts.title') : 'Expected cost');
      const title = opponent ? `${base} — ${opponent}` : base;

      try {
        const { cost: updated } = await supabaseService.addPlannedCostToLedger({
          cost,
          matchup,
          seasonId: selectedSeason,
          teamSeasonId,
          title,
        });
        setPlannedCosts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        onDataChange?.();
        if (showToast && t) showToast(t('planCosts.ledgerAdded'));
        return { success: true, cost: updated };
      } catch (e) {
        console.error('Add planned cost to ledger failed:', e);
        const message = e?.message || (t ? t('planCosts.ledgerFailed') : 'Could not file that in the ledger.');
        if (showToast) showToast(message, true);
        return { success: false, error: message };
      }
    },
    [planContributions, selectedSeason, teamSeasonId, onDataChange, showToast, t],
  );

  // Estimates for games that are still on, minus any whose real spend the event
  // push has already put in the budget.
  const entries = useMemo(
    () => buildPlannedEntries({ matchups, plannedCosts, eventContributions }),
    [matchups, plannedCosts, eventContributions],
  );

  const summary = useMemo(
    () => summarizePlannedCosts({ entries, contributions: planContributions }),
    [entries, planContributions],
  );

  const pushPlannedCosts = useCallback(
    async ({ reason = '' } = {}) => {
      if (!teamSeasonId || !selectedSeason) {
        return { success: false, error: t ? t('planCosts.noBudget') : 'No season budget available.' };
      }

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
        const result = await supabaseService.pushPlannedCostsToBudget({
          seasonId: selectedSeason,
          teamSeasonId,
          entries,
          isFinalized,
          recalculateBaseFee: recalcPolicyFor(currentTeamSeason),
          amendmentReason: reason,
          feeInputs,
        });

        await loadContributions();
        onDataChange?.();

        if (showToast && t) {
          if (!result.applied) showToast(t('planCosts.noChange'));
          else showToast(isFinalized ? t('planCosts.amended') : t('planCosts.pushed'));
        }
        return { success: true, ...result };
      } catch (e) {
        console.error('Push planned costs to budget failed:', e);
        const message = e?.message || (t ? t('planCosts.failed') : 'Could not update the budget.');
        if (showToast) showToast(message, true);
        return { success: false, error: message };
      }
    },
    [teamSeasonId, selectedSeason, currentTeamSeason, entries, loadContributions, onDataChange, showToast, t],
  );

  return {
    plannedCosts,
    planContributions,
    entries,
    summary,
    loading,
    addPlannedCost,
    updatePlannedCost,
    deletePlannedCost,
    pushPlannedCosts,
    sendCostToLedger,
    refreshPlannedCosts: loadCosts,
  };
}
