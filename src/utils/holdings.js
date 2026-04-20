// Holding buckets — the three real places money lives, plus 'none' for
// excluded entries like player credits. Accounts belong to exactly one.

import { Landmark, Banknote, Wallet } from 'lucide-react';

export const HOLDINGS = ['digital', 'bank', 'cash', 'none'];

export const HOLDING_LABELS = {
  digital: 'Digital',
  bank: 'Bank',
  cash: 'Cash',
  none: 'Uncategorized',
};

export const HOLDING_ICONS = {
  digital: Wallet,
  bank: Landmark,
  cash: Banknote,
  none: Wallet,
};

export const HOLDING_COLORS = {
  digital: {
    bg: 'bg-blue-50 dark:bg-blue-900/30',
    text: 'text-blue-700 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-700',
    icon: 'text-blue-500 dark:text-blue-400',
  },
  bank: {
    bg: 'bg-slate-50 dark:bg-slate-800',
    text: 'text-slate-700 dark:text-slate-300',
    border: 'border-slate-200 dark:border-slate-700',
    icon: 'text-slate-500 dark:text-slate-400',
  },
  cash: {
    bg: 'bg-emerald-50 dark:bg-emerald-900/30',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-200 dark:border-emerald-700',
    icon: 'text-emerald-500 dark:text-emerald-400',
  },
  none: {
    bg: 'bg-slate-50 dark:bg-slate-800',
    text: 'text-slate-500 dark:text-slate-400',
    border: 'border-slate-200 dark:border-slate-700',
    icon: 'text-slate-400 dark:text-slate-500',
  },
};

// Which holdings count toward "money holdings" totals.
export const TRACKED_HOLDINGS = ['digital', 'bank', 'cash'];
