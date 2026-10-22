import { useContext, useMemo } from 'react';
import { DataContext } from '../context/DataContext';
import { FinanceContext } from '../context/FinanceContext';
import { NavigationContext } from '../context/NavigationContext';
import { progressFor } from '../utils/compliance';
import { isParentItem } from '../utils/checklist';

// Paperwork due inside this window is "soon" enough to lead Home.
const SOON_DAYS = 7;
const DAY_MS = 86400000;

const EMPTY = { badges: {}, paperwork: [], balance: null };

const daysUntil = (dateStr, today) => {
  const due = new Date(`${dateStr}T23:59:59`);
  return Math.floor((due.getTime() - today.getTime()) / DAY_MS);
};

/**
 * What is waiting on the signed-in user, for the tab badges and the Home
 * attention strip — the one place both read, so a badge can never count
 * something the strip does not mention.
 *
 * Parents: the checklist items they owe (all of them badge the tab; the dated
 * ones due within a week, or overdue, lead Home), and a balance once the
 * budget is final. Staff: a dot on Money while any player owes fees.
 *
 * Reads the contexts directly rather than through their throwing hooks, so
 * the shell still renders where only navigation is provided.
 */
export function useAttention() {
  const data = useContext(DataContext);
  const finance = useContext(FinanceContext);
  const nav = useContext(NavigationContext);

  return useMemo(() => {
    if (!data || !finance || !nav) return EMPTY;
    const { calculatePlayerFinancials } = finance;
    const transactions = data.seasonalTransactions || [];

    if (nav.effectiveIsStaff) {
      const owing = (data.seasonalPlayers || []).some((player) => {
        const fin = calculatePlayerFinancials?.(player, transactions);
        return fin && fin.baseFee > 0 && fin.remainingBalance > 0 && !fin.isWaived;
      });
      return { ...EMPTY, badges: owing ? { money: 'dot' } : {} };
    }

    const players = data.myPlayers || [];
    const today = new Date();
    const owed = players.flatMap((player) =>
      progressFor(data.compliance, player.id)
        .outstanding.filter((item) => item.required && isParentItem(item))
        .map((item) => ({ ...item, player })),
    );
    const paperwork = owed
      .filter((item) => item.dueDate && daysUntil(item.dueDate, today) <= SOON_DAYS)
      .map((item) => ({ ...item, daysLeft: daysUntil(item.dueDate, today) }))
      .sort((a, b) => a.daysLeft - b.daysLeft);

    const amount = players.reduce((sum, player) => {
      const fin = calculatePlayerFinancials?.(player, transactions);
      return fin && fin.isFinalized && !fin.isWaived && fin.remainingBalance > 0 ? sum + fin.remainingBalance : sum;
    }, 0);

    return {
      badges: owed.length > 0 ? { team: owed.length } : {},
      paperwork,
      balance: amount > 0 ? amount : null,
    };
  }, [data, finance, nav]);
}
