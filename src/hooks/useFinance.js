// src/hooks/useFinance.js
// Financial display + waterfall distribution.
//
// DISPLAY: Reads pre-fetched data from the player_financials DB view.
//          No client-side calculation — the view is the single source of truth.
//          isFinalized comes from each player's team_season, not from a global flag.
//
// WATERFALL: Fetches FRESH financials from the view before each distribution.

import { supabaseService } from '../services/supabaseService';
import { useCallback } from 'react';

export const useFinance = (selectedSeason, seasonalPlayers, isBudgetLocked, teamSeasonId = null, currentSeasonData = null, playerFinancialsMap = {}) => {

  // ── DISPLAY LOOKUP ──
  // Returns financials for a player from the pre-fetched view data.
  // isDraft is derived from the PLAYER'S OWN team_season finalization,
  // not from the global currentSeasonData (which parents don't have).
  const calculatePlayerFinancials = useCallback((player, _transactions) => {
    const safeMap = playerFinancialsMap || {};
    const data = safeMap[player?.id];
    if (!data) {
      return {
        baseFee: 0, totalPaid: 0, fundraising: 0, sponsorships: 0,
        credits: 0, remainingBalance: 0, isWaived: false,
        isFinalized: isBudgetLocked || false,
        isDraft: !isBudgetLocked,
      };
    }
    return {
      ...data,
      isFinalized: data.isFinalized ?? isBudgetLocked ?? false,
      isDraft: !(data.isFinalized ?? isBudgetLocked ?? false),
    };
  }, [playerFinancialsMap, isBudgetLocked]);

  // ── WATERFALL DISTRIBUTION ──
  const handleWaterfallCredit = async (totalAmount, title, sourcePlayerId, originalTxId, category = 'SPO') => {
    if (!isBudgetLocked) throw new Error("Budget must be finalized before distributing funds.");

    const batchId = `waterfall_${Date.now()}`;
    let remainingAmount = parseFloat(totalAmount);
    const today = new Date().toISOString().split('T')[0];

    // Fetch FRESH financials from the DB view
    const freshFinancials = await supabaseService.getPlayerFinancials(selectedSeason, teamSeasonId);
    const creditsToApply = {};

    // 1. PRIMARY PLAYER CAP
    if (sourcePlayerId) {
      const primaryStats = freshFinancials[sourcePlayerId];
      if (primaryStats && primaryStats.remainingBalance > 0) {
        const applyAmt = Math.min(primaryStats.remainingBalance, remainingAmount);
        if (applyAmt > 0) {
          creditsToApply[sourcePlayerId] = applyAmt;
          remainingAmount -= applyAmt;
        }
      }
    }

    // 2. DISTRIBUTE REMAINDER TO POOL
    if (remainingAmount > 0.01) {
      let pool = seasonalPlayers
        .filter(p =>
          p.id !== sourcePlayerId &&
          !p.seasonProfiles?.[selectedSeason]?.feeWaived
        )
        .map(p => ({
          id: p.id,
          currentBalance: freshFinancials[p.id]?.remainingBalance || 0,
        }))
        .filter(p => p.currentBalance > 0);

      while (remainingAmount > 0.01 && pool.length > 0) {
        const splitAmt = remainingAmount / pool.length;
        let roundDist = 0;
        for (let i = pool.length - 1; i >= 0; i--) {
          const p = pool[i];
          const applyAmt = Math.min(p.currentBalance, splitAmt);
          creditsToApply[p.id] = (creditsToApply[p.id] || 0) + applyAmt;
          p.currentBalance -= applyAmt;
          roundDist += applyAmt;
          if (p.currentBalance <= 0.01) pool.splice(i, 1);
        }
        remainingAmount -= roundDist;
        if (roundDist < 0.01) break;
      }
    }

    const promises = [];
    const baseTxData = {
      seasonId: selectedSeason,
      waterfallBatchId: batchId,
      originalTxId: originalTxId || null,
      date: today,
      cleared: true,
      distributed: false,
      ...(teamSeasonId ? { teamSeasonId } : {}),
    };

    // 3. CREATE PLAYER CREDIT TRANSACTIONS
    Object.entries(creditsToApply).forEach(([pId, amt]) => {
      promises.push(supabaseService.addTransaction({
        ...baseTxData, title, amount: Number(amt.toFixed(2)), playerId: pId, category,
      }));
    });

    // 4. OVERFLOW TO TEAM POOL
    if (remainingAmount > 0.01) {
      promises.push(supabaseService.addTransaction({
        ...baseTxData, title: `${title} (Team Pool Overflow)`, amount: Number(remainingAmount.toFixed(2)),
        playerId: null, category,
      }));
    }

    await Promise.all(promises);
    if (originalTxId) await supabaseService.updateTransaction(originalTxId, { distributed: true });
    return batchId;
  };

  const revertWaterfall = async (batchId, originalTxId) => {
    await supabaseService.deleteBatch('waterfallBatchId', batchId);
    if (originalTxId) await supabaseService.updateTransaction(originalTxId, { distributed: false });
  };

  return { calculatePlayerFinancials, handleWaterfallCredit, revertWaterfall };
};