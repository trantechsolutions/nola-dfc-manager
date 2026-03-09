// src/hooks/useFinance.js
// Financial calculations and waterfall distribution.
//
// KEY BEHAVIOR:
//   Draft budget   → uses currentSeasonData.calculatedBaseFee for ALL players
//   Finalized      → uses each player's locked-in seasonProfiles[season].baseFee
//
// This ensures the Dashboard, Ledger, and Parent View always show the 
// correct fee even while the budget is still being built.

import { supabaseService } from '../services/supabaseService';
import { useCallback } from 'react';

export const useFinance = (selectedSeason, seasonalPlayers, isBudgetLocked, teamSeasonId = null, currentSeasonData = null) => {

  // The live fee from the budget calculator (updates on every draft save)
  const liveBaseFee = currentSeasonData?.calculatedBaseFee || 0;

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
    // Draft: use the live calculated fee from the budget (same for everyone)
    // Finalized: use the locked per-player fee from their season profile
    let baseFee;
    if (isWaived) {
      baseFee = 0;
    } else if (!isBudgetLocked && liveBaseFee > 0) {
      // Draft mode: everyone gets the current calculated fee
      baseFee = liveBaseFee;
    } else {
      // Finalized mode: use the locked per-player fee
      baseFee = Number(player.seasonProfiles?.[selectedSeason]?.baseFee ?? 0);
    }

    let paid = 0, fun = 0, spo = 0, cre = 0;
    
    playerTxs.forEach(tx => {
      const amt = Number(tx.amount || 0);
      if (tx.category === 'TMF') paid += amt;
      // FIX: Only count waterfall-generated credits (waterfallBatchId),
      // NOT the original deposit (tx.distributed). The original deposit is
      // team-level income — its "distributed" flag is just a status marker.
      // Counting both would double-count for the source player.
      if (tx.category === 'FUN' && tx.waterfallBatchId) fun += amt;
      if (tx.category === 'SPO' && tx.waterfallBatchId) spo += amt;
      if (tx.category === 'CRE') cre += amt;
    });

    const remainingBalance = Math.max(0, baseFee - (paid + fun + spo + cre));
    return { baseFee, totalPaid: paid, fundraising: fun, sponsorships: spo, credits: cre, remainingBalance, isWaived, isDraft: !isBudgetLocked };
  }, [selectedSeason, isBudgetLocked, liveBaseFee]);

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