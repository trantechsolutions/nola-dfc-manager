// src/hooks/useFinance.js
// Financial calculations and waterfall distribution.
//
// SCHEMA REALITY:
//   player_seasons: fee_waived, status, team_season_id  (NO base_fee column)
//   team_seasons:   base_fee, buffer_percent, etc.
//
// The fee is the SAME for all non-waived players on a team for a given season.
// It comes from team_seasons.base_fee, surfaced as currentSeasonData.calculatedBaseFee
// by useSoccerYear. Both draft and finalized use the same source.

import { supabaseService } from '../services/supabaseService';
import { useCallback } from 'react';

export const useFinance = (selectedSeason, seasonalPlayers, isBudgetLocked, teamSeasonId = null, currentSeasonData = null) => {

  // The team fee from team_seasons.base_fee (always current after any budget save)
  const teamBaseFee = currentSeasonData?.calculatedBaseFee || 0;

  const calculatePlayerFinancials = useCallback((player, transactions = []) => {
    if (!transactions || !Array.isArray(transactions)) {
      return { baseFee: 0, totalPaid: 0, fundraising: 0, sponsorships: 0, credits: 0, remainingBalance: 0, isWaived: false, isDraft: !isBudgetLocked };
    }

    const isCleared = (tx) => tx.cleared === true || String(tx.cleared).toLowerCase() === 'true';
    const seasonTxs = transactions.filter(tx => tx.seasonId === selectedSeason && isCleared(tx));

    const fullName = `${player.firstName} ${player.lastName}`.trim().toLowerCase();
    const playerTxs = seasonTxs.filter(tx => {
      if (tx.playerId === player.id) return true;
      const txName = (tx.playerName || '').trim().toLowerCase();
      return txName === fullName;
    });

    const isWaived = player.seasonProfiles?.[selectedSeason]?.feeWaived || false;

    // ── FEE DETERMINATION ──
    // Fee always comes from team_seasons.base_fee (via currentSeasonData.calculatedBaseFee).
    // player_seasons has NO base_fee column — the fee is team-wide, not per-player.
    // Waived players get $0.
    const baseFee = isWaived ? 0 : teamBaseFee;

    let paid = 0, fun = 0, spo = 0, cre = 0;

    playerTxs.forEach(tx => {
      const amt = Number(tx.amount || 0);
      if (tx.category === 'TMF') paid += amt;
      // Only count waterfall-distributed credits, not the original deposit
      if (tx.category === 'FUN' && tx.waterfallBatchId) fun += amt;
      if (tx.category === 'SPO' && tx.waterfallBatchId) spo += amt;
      if (tx.category === 'CRE') cre += amt;
    });

    const remainingBalance = Math.max(0, baseFee - (paid + fun + spo + cre));
    return { baseFee, totalPaid: paid, fundraising: fun, sponsorships: spo, credits: cre, remainingBalance, isWaived, isDraft: !isBudgetLocked };
  }, [selectedSeason, isBudgetLocked, teamBaseFee]);

  const handleWaterfallCredit = async (totalAmount, title, sourcePlayerId, originalTxId, category = 'SPO') => {
    if (!isBudgetLocked) throw new Error("Budget must be finalized before distributing funds.");

    const batchId = `waterfall_${Date.now()}`;
    let remainingAmount = parseFloat(totalAmount);
    const today = new Date().toISOString().split('T')[0];

    const currentTxs = await supabaseService.getAllTransactions();
    const creditsToApply = {};

    // 1. PRIMARY PLAYER CAP
    if (sourcePlayerId) {
      const primaryPlayer = seasonalPlayers.find(p => p.id === sourcePlayerId);
      if (primaryPlayer) {
        const stats = calculatePlayerFinancials(primaryPlayer, currentTxs);
        const applyAmt = Math.min(stats.remainingBalance, remainingAmount);
        if (applyAmt > 0) { creditsToApply[sourcePlayerId] = applyAmt; remainingAmount -= applyAmt; }
      }
    }

    // 2. DISTRIBUTE REMAINDER
    if (remainingAmount > 0.01) {
      let pool = seasonalPlayers.filter(p =>
        p.id !== sourcePlayerId && !p.seasonProfiles?.[selectedSeason]?.feeWaived
      ).map(p => ({ id: p.id, currentBalance: calculatePlayerFinancials(p, currentTxs).remainingBalance }))
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

    // 3. CREATE PLAYER TRANSACTIONS
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