// src/hooks/useFinance.js
// ──────────────────────────────────────────────────────────────────────
// Financial calculations and waterfall distribution.
//
// SCHEMA FIX:
//   The old code read player.seasonProfiles[season].baseFee for finalized
//   budgets. That column no longer exists on player_seasons — the fee is
//   computed by the player_financials DB view from team_seasons data.
//
//   The fee is now ALWAYS sourced from currentSeasonData.calculatedBaseFee
//   (which maps to team_seasons.base_fee). This is the single source of
//   truth for the per-player fee, whether draft or finalized. Waived
//   players get $0.
// ──────────────────────────────────────────────────────────────────────

import { supabaseService } from '../services/supabaseService';
import { useCallback } from 'react';

export const useFinance = (selectedSeason, seasonalPlayers, isBudgetLocked, teamSeasonId = null, currentSeasonData = null) => {

  // The team's fee from team_seasons — single source of truth
  const teamBaseFee = currentSeasonData?.calculatedBaseFee || currentSeasonData?.baseFee || 0;

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
    // Fee comes from team_seasons (via currentSeasonData) for ALL players.
    // The player_financials DB view computes it the same way:
    //   ceil(total_projected_expenses * (1 + buffer/100) / roster / 50) * 50
    // Waived players get $0.
    const baseFee = isWaived ? 0 : teamBaseFee;

    let paid = 0, fun = 0, spo = 0, cre = 0;
    
    playerTxs.forEach(tx => {
      const amt = Number(tx.amount || 0);
      if (tx.category === 'TMF') paid += amt;
      if (tx.category === 'FUN' && (tx.waterfallBatchId || tx.distributed)) fun += amt;
      if (tx.category === 'SPO' && (tx.waterfallBatchId || tx.distributed)) spo += amt; 
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

    // 2. DISTRIBUTE REMAINDER via waterfall
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