import { firebaseService } from '../services/firebaseService';
import { Timestamp } from 'firebase/firestore';
import { useCallback } from 'react';

export const useFinance = (selectedSeason, seasonalPlayers, isBudgetLocked) => {
  
  const calculatePlayerFinancials = useCallback((player, transactions = []) => {
    if (!transactions || !Array.isArray(transactions)) {
      return { baseFee: 0, totalPaid: 0, fundraising: 0, sponsorships: 0, credits: 0, remainingBalance: 0, isWaived: false };
    }

    const isCleared = (tx) => tx.cleared === true || String(tx.cleared).toLowerCase() === 'true';
    const seasonTxs = transactions.filter(tx => tx.seasonId === selectedSeason && isCleared(tx));
    
    const fullName = `${player.firstName} ${player.lastName}`.trim().toLowerCase();

    const playerTxs = seasonTxs.filter(tx => {
      if (tx.playerId === player.id) return true;
      const txName = (tx.playerName || tx.Name || '').trim().toLowerCase();
      return txName === fullName;
    });

    const isWaived = player.seasonProfiles?.[selectedSeason]?.feeWaived || false;
    const baseFee = isWaived ? 0 : Number(player.seasonProfiles?.[selectedSeason]?.baseFee ?? 750);

    let paid = 0, fun = 0, spo = 0, cre = 0;
    
    playerTxs.forEach(tx => {
      const amt = Number(tx.amount || 0);
      
      if (tx.category === 'TMF') paid += amt;
      if (tx.category === 'FUN') fun += amt;
      if (tx.category === 'SPO' && tx.waterfallBatchId) spo += amt; 
      if (tx.category === 'CRE') cre += amt;
    });

    const remainingBalance = Math.max(0, baseFee - (paid + fun + spo + cre));

    return { baseFee, totalPaid: paid, fundraising: fun, sponsorships: spo, credits: cre, remainingBalance, isWaived };
  }, [selectedSeason]);

  const handleWaterfallCredit = async (totalAmount, title, sourcePlayerId, originalTxId) => {
    if (!isBudgetLocked) throw new Error("Budget must be finalized first.");

    const batchId = `waterfall_${Date.now()}`;
    let remainingAmount = parseFloat(totalAmount);

    // Fetch fresh transactions to ensure balances are 100% accurate at the moment of distribution
    const currentTxs = await firebaseService.getAll('transactions');
    const creditsToApply = {};

    // 1. PRIMARY PLAYER CAP
    if (sourcePlayerId) {
      const primaryPlayer = seasonalPlayers.find(p => p.id === sourcePlayerId);
      if (primaryPlayer) {
        const stats = calculatePlayerFinancials(primaryPlayer, currentTxs);
        const applyAmt = Math.min(stats.remainingBalance, remainingAmount);
        
        if (applyAmt > 0) {
          creditsToApply[sourcePlayerId] = applyAmt;
          remainingAmount -= applyAmt;
        }
      }
    }

    // 2. DISTRIBUTE REMAINDER TO NON-WAIVED PLAYERS
    if (remainingAmount > 0.01) {
      // Build a pool of eligible players and get their current balances
      let pool = seasonalPlayers.filter(p => 
        p.id !== sourcePlayerId && // Don't double-pay the primary player
        !p.seasonProfiles?.[selectedSeason]?.feeWaived // Ignore waived players
      ).map(p => {
        const stats = calculatePlayerFinancials(p, currentTxs);
        return { id: p.id, currentBalance: stats.remainingBalance };
      }).filter(p => p.currentBalance > 0);

      // Iteratively divide the money until it's gone or everyone is paid off
      while (remainingAmount > 0.01 && pool.length > 0) {
        const splitAmt = remainingAmount / pool.length;
        let roundDist = 0;

        for (let i = pool.length - 1; i >= 0; i--) {
          const p = pool[i];
          const applyAmt = Math.min(p.currentBalance, splitAmt);
          
          creditsToApply[p.id] = (creditsToApply[p.id] || 0) + applyAmt;
          p.currentBalance -= applyAmt;
          roundDist += applyAmt;

          // Remove them from the next round if their balance is now 0
          if (p.currentBalance <= 0.01) {
            pool.splice(i, 1);
          }
        }
        remainingAmount -= roundDist;
        
        // Failsafe to prevent float-math infinite loops
        if (roundDist < 0.01) break; 
      }
    }

    const promises = [];

    // 3. CREATE PLAYER TRANSACTIONS
    Object.entries(creditsToApply).forEach(([pId, amt]) => {
      const player = seasonalPlayers.find(p => p.id === pId);
      promises.push(firebaseService.addDocument('transactions', {
        title: title,
        amount: Number(amt.toFixed(2)),
        playerId: pId,
        playerName: `${player.firstName} ${player.lastName}`,
        category: 'SPO',
        seasonId: selectedSeason,
        waterfallBatchId: batchId,
        originalTxId: originalTxId || null,
        date: Timestamp.now(),
        cleared: true
      }));
    });

    // 4. OVERFLOW TO TEAM POOL
    if (remainingAmount > 0.01) {
      promises.push(firebaseService.addDocument('transactions', {
        title: `${title} (Team Pool Overflow)`,
        amount: Number(remainingAmount.toFixed(2)),
        playerId: null,
        playerName: 'Team Pool',
        category: 'SPO',
        seasonId: selectedSeason,
        waterfallBatchId: batchId,
        originalTxId: originalTxId || null,
        date: Timestamp.now(),
        cleared: true
      }));
    }

    await Promise.all(promises);

    // Mark original as distributed
    if (originalTxId) {
      await firebaseService.updateDocument('transactions', originalTxId, { distributed: true });
    }
    
    return batchId;
  };

  const revertWaterfall = async (batchId, originalTxId) => {
    await firebaseService.deleteBatch('transactions', 'waterfallBatchId', batchId);
    if (originalTxId) {
      await firebaseService.updateDocument('transactions', originalTxId, { distributed: false });
    }
  };

  return { calculatePlayerFinancials, handleWaterfallCredit, revertWaterfall };
};