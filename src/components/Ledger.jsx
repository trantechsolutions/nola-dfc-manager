import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  X,
  ArrowRightLeft,
  Link2,
  Undo2,
  HandCoins,
} from 'lucide-react';
import { useT } from '../i18n/I18nContext';
import AccountFilterMenu from './AccountFilterMenu';
import { HOLDINGS, HOLDING_LABELS } from '../utils/holdings';
import { buildRefundIndex, canRefund, refundableRemaining } from '../utils/refunds';
import {
  buildInstallmentIndex,
  blocksRefund,
  canRecordPayment,
  hasPaymentPlan,
  isInstallment,
  planProgress,
} from '../utils/installments';
import { hasSplitDates } from '../utils/txDates';

const DEFAULT_CATEGORY_COLORS = {
  TMF: 'bg-blue-50 text-blue-700 dark:text-blue-300',
  SPO: 'bg-violet-50 text-violet-700 dark:text-violet-300',
  FUN: 'bg-emerald-50 text-emerald-700 dark:text-emerald-300',
  OPE: 'bg-muted text-foreground',
  TOU: 'bg-amber-50 text-amber-700 dark:text-amber-300',
  LEA: 'bg-orange-50 text-orange-700',
  CRE: 'bg-cyan-50 text-cyan-700',
  FRI: 'bg-rose-50 text-rose-700',
  TRF: 'bg-indigo-50 text-indigo-700 dark:text-indigo-300',
};

// 'YYYY-MM-DD' rendered without a timezone round-trip — `new Date('2026-08-19')`
// parses as UTC midnight and shows the day before west of Greenwich.
function formatShortDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('T')[0].split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function Ledger({
  transactions,
  onEditTx,
  onDeleteTx,
  onRefundTx,
  onRecordPayment,
  formatMoney,
  categoryLabels: propLabels, // NEW: dynamic labels from useCategoryManager
  categoryColors: propColors, // NEW: dynamic colors from useCategoryManager
  accounts = [],
  accountMap = {},
}) {
  const { t } = useT();

  // Build translated category labels — props take precedence, translated defaults fill gaps
  const CATEGORY_LABELS = useMemo(
    () => ({
      TMF: t('categories.teamFees'),
      SPO: t('categories.sponsorship'),
      FUN: t('categories.fundraising'),
      OPE: t('categories.operating'),
      TOU: t('categories.tournament'),
      LEA: t('categories.leagueRefs'),
      CRE: t('categories.credit'),
      FRI: t('categories.friendlies'),
      TRF: t('categories.transfer'),
      ...(propLabels || {}),
    }),
    [t, propLabels],
  );
  const CATEGORY_COLORS = useMemo(() => ({ ...DEFAULT_CATEGORY_COLORS, ...(propColors || {}) }), [propColors]);

  // originalTxId -> amount already refunded. Built from the full list so the
  // badge on an original is right even when its refund row is filtered out.
  const refundIndex = useMemo(() => buildRefundIndex(transactions), [transactions]);

  // parentTxId -> amount already paid towards it. Same reasoning as above: built
  // from the full list so a plan's progress is right even when a payment is
  // filtered out from under it.
  const installmentIndex = useMemo(() => buildInstallmentIndex(transactions), [transactions]);

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  // Empty set = every account. Multi-select so a bank statement spanning two
  // accounts can be read as one list.
  const [accountFilter, setAccountFilter] = useState(() => new Set());
  const [holdingFilter, setHoldingFilter] = useState('all');
  const [flowFilter, setFlowFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const pageSize = 20;

  // Accounts that actually appear in the current transaction list (account_id,
  // transfer_from/to_account_id). Drives the account filter dropdown so the
  // user only sees accounts they have activity on.
  const accountOptions = useMemo(() => {
    const ids = new Set();
    transactions.forEach((tx) => {
      if (tx.accountId) ids.add(tx.accountId);
      if (tx.transferFromAccountId) ids.add(tx.transferFromAccountId);
      if (tx.transferToAccountId) ids.add(tx.transferToAccountId);
    });
    return accounts.filter((a) => ids.has(a.id));
  }, [accounts, transactions]);

  const accountsByHolding = useMemo(() => {
    const grouped = {};
    HOLDINGS.forEach((h) => {
      grouped[h] = [];
    });
    accountOptions.forEach((a) => {
      if (grouped[a.holding]) grouped[a.holding].push(a);
    });
    return grouped;
  }, [accountOptions]);

  const filteredTransactions = useMemo(() => {
    let result = [...transactions];

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(
        (tx) =>
          tx.title?.toLowerCase().includes(q) ||
          tx.playerName?.toLowerCase().includes(q) ||
          tx.notes?.toLowerCase().includes(q),
      );
    }

    if (categoryFilter !== 'all') {
      result = result.filter((tx) => tx.category === categoryFilter);
    }

    if (accountFilter.size > 0) {
      result = result.filter((tx) =>
        [tx.accountId, tx.transferFromAccountId, tx.transferToAccountId].some((id) => id && accountFilter.has(id)),
      );
    }

    if (holdingFilter !== 'all') {
      result = result.filter((tx) => {
        const accIds = [tx.accountId, tx.transferFromAccountId, tx.transferToAccountId].filter(Boolean);
        return accIds.some((id) => accountMap[id]?.holding === holdingFilter);
      });
    }

    if (flowFilter === 'income') result = result.filter((tx) => tx.amount > 0 && tx.category !== 'TRF');
    if (flowFilter === 'expense') result = result.filter((tx) => tx.amount < 0 && tx.category !== 'TRF');
    if (flowFilter === 'transfer') result = result.filter((tx) => tx.category === 'TRF');
    if (flowFilter === 'refund') result = result.filter((tx) => tx.refundOfTxId || refundIndex[tx.id] > 0);
    if (flowFilter === 'plan') result = result.filter((tx) => isInstallment(tx) || installmentIndex[tx.id] > 0);

    if (statusFilter === 'cleared') result = result.filter((tx) => tx.cleared);
    if (statusFilter === 'pending') result = result.filter((tx) => !tx.cleared);

    result.sort((a, b) => {
      const dateA = a.date?.seconds || 0;
      const dateB = b.date?.seconds || 0;
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });

    return result;
  }, [
    transactions,
    searchTerm,
    categoryFilter,
    accountFilter,
    holdingFilter,
    accountMap,
    flowFilter,
    statusFilter,
    sortOrder,
    refundIndex,
    installmentIndex,
  ]);

  // One visible row per transaction, with its payments and reversals folded in
  // behind an expand toggle.
  //
  // Order matters: payments fold first, and a refund only folds into what it
  // reverses if that row is itself still visible at the top level. A refund of a
  // folded payment therefore keeps its own row rather than disappearing two
  // levels down — nothing may silently vanish from the ledger.
  const { rows, foldedPaymentIds } = useMemo(() => {
    const visible = new Set(filteredTransactions.map((tx) => tx.id));

    const payments = {};
    const foldedAsPayment = new Set();
    filteredTransactions.forEach((tx) => {
      if (tx.installmentOfTxId && visible.has(tx.installmentOfTxId)) {
        (payments[tx.installmentOfTxId] ||= []).push(tx);
        foldedAsPayment.add(tx.id);
      }
    });

    const refunds = {};
    const foldedAsRefund = new Set();
    filteredTransactions.forEach((tx) => {
      if (tx.refundOfTxId && visible.has(tx.refundOfTxId) && !foldedAsPayment.has(tx.refundOfTxId)) {
        (refunds[tx.refundOfTxId] ||= []).push(tx);
        foldedAsRefund.add(tx.id);
      }
    });

    return {
      rows: filteredTransactions
        .filter((tx) => !foldedAsPayment.has(tx.id) && !foldedAsRefund.has(tx.id))
        .map((tx) => ({ tx, refunds: refunds[tx.id] || [], payments: payments[tx.id] || [] })),
      foldedPaymentIds: foldedAsPayment,
    };
  }, [filteredTransactions]);

  // Totals stay over the flat list: a nested refund is still real money moving,
  // it just doesn't get a line of its own.
  //
  // A payment folded under its obligation is the exception. The obligation
  // already carries the full amount here — counting the instalments on top would
  // report the same money twice. A payment whose obligation is filtered out of
  // view still counts, or the money would vanish from the totals entirely.
  const countsInTotals = (tx) => !foldedPaymentIds.has(tx.id);
  const totalIncome = filteredTransactions
    .filter((tx) => tx.amount > 0 && tx.category !== 'TRF' && countsInTotals(tx))
    .reduce((s, tx) => s + tx.amount, 0);
  const totalExpense = filteredTransactions
    .filter((tx) => tx.amount < 0 && tx.category !== 'TRF' && countsInTotals(tx))
    .reduce((s, tx) => s + tx.amount, 0);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pagedRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const hasActiveFilters =
    searchTerm ||
    categoryFilter !== 'all' ||
    accountFilter.size > 0 ||
    holdingFilter !== 'all' ||
    flowFilter !== 'all' ||
    statusFilter !== 'all';
  const clearAllFilters = () => {
    setSearchTerm('');
    setCategoryFilter('all');
    setAccountFilter(new Set());
    setHoldingFilter('all');
    setFlowFilter('all');
    setStatusFilter('all');
    setCurrentPage(1);
  };
  const setFilterAndReset = (setter) => (val) => {
    setter(val);
    setCurrentPage(1);
  };

  const TransferBadge = ({ tx }) => {
    const fromName = accountMap[tx.transferFromAccountId]?.name || '';
    const toName = accountMap[tx.transferToAccountId]?.name || '';
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-700 dark:text-indigo-400 bg-indigo-50 px-2 py-0.5 rounded">
        {fromName} <ArrowRightLeft size={10} /> {toName}
      </span>
    );
  };

  // Two faces of the same link: the reversing row is marked REFUND, the row it
  // reverses carries how much of it has been given back.
  const RefundBadge = ({ tx }) => {
    if (tx.refundOfTxId) {
      return (
        <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded whitespace-nowrap">
          <Undo2 size={10} /> {t('ledger.refund')}
        </span>
      );
    }
    const refunded = refundIndex[tx.id] || 0;
    if (!refunded) return null;
    const isFull = refundableRemaining(tx, refundIndex) === 0;
    return (
      <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded whitespace-nowrap">
        <Undo2 size={10} />{' '}
        {isFull ? t('ledger.refunded') : t('ledger.refundedAmount', { amount: formatMoney(refunded) })}
      </span>
    );
  };

  // Two faces of a payment plan: the payment row is marked PAYMENT, the
  // obligation it pays off carries how far along the plan is.
  const PlanBadge = ({ tx }) => {
    if (isInstallment(tx)) {
      return (
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
          <HandCoins size={10} /> {t('ledger.payment')}
        </span>
      );
    }
    if (!hasPaymentPlan(tx, installmentIndex)) return null;
    const { paid, total, complete } = planProgress(tx, installmentIndex);
    return (
      <span
        className={`inline-flex items-center gap-1 whitespace-nowrap rounded px-2 py-0.5 text-xs font-bold ${
          complete
            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
            : 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
        }`}
      >
        <HandCoins size={10} />{' '}
        {complete ? t('ledger.paidInFull') : t('ledger.paidOf', { paid: formatMoney(paid), total: formatMoney(total) })}
      </span>
    );
  };

  const toggleExpanded = (id) =>
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // What the transaction is actually worth once its reversals are applied.
  const netOf = (tx, refunds) => refunds.reduce((sum, r) => sum + r.amount, tx.amount);

  const formatSigned = (amount) => `${amount < 0 ? '-' : '+'}${formatMoney(Math.abs(amount))}`;

  const amountColor = (tx) => {
    if (tx.category === 'TRF') return 'text-indigo-700 dark:text-indigo-400';
    return tx.amount < 0 ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400';
  };

  return (
    <div className="space-y-4 pb-20 md:pb-6">
      {/* ── TOOLBAR ── */}
      <div className="bg-card p-4 rounded-lg border border-border shadow-sm space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-muted-foreground" size={16} />
          <input
            type="text"
            placeholder={t('ledger.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-9 pr-4 py-2 bg-background border border-border rounded-lg text-sm focus:ring-2 focus:ring-ring outline-none"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-2.5 text-muted-foreground hover:text-muted-foreground"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex items-center gap-1">
            <Filter size={13} className="text-muted-foreground" />
            <select
              value={categoryFilter}
              onChange={(e) => setFilterAndReset(setCategoryFilter)(e.target.value)}
              className="bg-background border border-border text-xs font-semibold rounded-lg px-2 py-1.5 focus:ring-0 cursor-pointer"
            >
              <option value="all">{t('ledger.allCategories')}</option>
              {Object.entries(CATEGORY_LABELS).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {accountOptions.length > 0 && (
            <>
              <AccountFilterMenu
                accountsByHolding={accountsByHolding}
                selectedIds={accountFilter}
                onChange={setFilterAndReset(setAccountFilter)}
              />
              <div className="flex items-center gap-1">
                <select
                  value={holdingFilter}
                  onChange={(e) => setFilterAndReset(setHoldingFilter)(e.target.value)}
                  className="bg-background border border-border text-xs font-semibold rounded-lg px-2 py-1.5 focus:ring-0 cursor-pointer"
                >
                  <option value="all">{t('ledger.allHoldings')}</option>
                  {HOLDINGS.filter((h) => h !== 'none').map((h) => (
                    <option key={h} value={h}>
                      {HOLDING_LABELS[h]}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <div className="flex bg-muted rounded-lg p-0.5">
            {[
              { val: 'all', label: t('common.all') },
              { val: 'income', label: t('ledger.income') },
              { val: 'expense', label: t('ledger.expense') },
              { val: 'transfer', label: t('ledger.transfers') },
              { val: 'refund', label: t('ledger.refunds') },
              { val: 'plan', label: t('ledger.payments') },
            ].map((opt) => (
              <button
                key={opt.val}
                onClick={() => setFilterAndReset(setFlowFilter)(opt.val)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                  flowFilter === opt.val
                    ? 'bg-card shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex bg-muted rounded-lg p-0.5">
            {[
              { val: 'all', label: t('common.all') },
              { val: 'cleared', label: t('ledger.cleared') },
              { val: 'pending', label: t('ledger.pending') },
            ].map((opt) => (
              <button
                key={opt.val}
                onClick={() => setFilterAndReset(setStatusFilter)(opt.val)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                  statusFilter === opt.val
                    ? 'bg-card shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-background border border-border hover:bg-muted rounded-lg text-xs font-semibold transition-colors ml-auto"
          >
            <ArrowUpDown size={12} />
            {sortOrder === 'desc' ? t('ledger.newest') : t('ledger.oldest')}
          </button>
        </div>

        {hasActiveFilters && (
          <div className="flex justify-between items-center pt-2 border-t border-border">
            <span className="text-xs text-muted-foreground font-semibold">
              {rows.length} result{rows.length !== 1 && 's'}
              <span className="text-emerald-700 dark:text-emerald-400 ml-3">+{formatMoney(totalIncome)}</span>
              <span className="text-red-700 dark:text-red-400 ml-2">{formatMoney(totalExpense)}</span>
            </span>
            <button
              onClick={clearAllFilters}
              className="text-xs font-semibold text-blue-700 dark:text-blue-400 hover:text-blue-800 flex items-center gap-1"
            >
              <X size={12} /> {t('common.clearFilters')}
            </button>
          </div>
        )}
      </div>

      {/* ── DESKTOP TABLE ── */}
      <div className="hidden md:block bg-card rounded-lg border border-border shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-background border-b border-border text-xs font-semibold text-muted-foreground">
            <tr>
              <th className="px-5 py-3.5">{t('common.date')}</th>
              <th className="px-5 py-3.5">{t('ledger.transaction')}</th>
              <th className="px-5 py-3.5">{t('ledger.player')}</th>
              <th className="px-5 py-3.5">{t('accountMgr.title')}</th>
              <th className="px-5 py-3.5">{t('common.status')}</th>
              <th className="px-5 py-3.5 text-right">{t('common.amount')}</th>
              <th className="px-3 py-3.5 text-center w-20"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {pagedRows.map(({ tx, refunds, payments }) => {
              const isDraft = !tx.cleared && tx.eventId;
              const isExpanded = expandedIds.has(tx.id);
              const net = netOf(tx, refunds);
              const onPlan = hasPaymentPlan(tx, installmentIndex);
              const plan = planProgress(tx, installmentIndex);
              const childCount = refunds.length + payments.length;
              return (
                <React.Fragment key={tx.id}>
                  <tr
                    className={`hover:bg-blue-50/30 transition-colors cursor-pointer ${isDraft ? 'border-l-2 border-l-amber-400 bg-amber-50/20 dark:bg-amber-900/20' : ''}`}
                    onClick={() => onEditTx(tx)}
                  >
                    <td className="px-5 py-3 text-xs font-medium text-muted-foreground whitespace-nowrap">
                      {tx.date?.seconds
                        ? new Date(tx.date.seconds * 1000).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: '2-digit',
                          })
                        : '—'}
                      {/* Money that moved on a different day than the event it paid for —
                          shown so the row's reconciliation month is never a mystery. */}
                      {hasSplitDates(tx) && (
                        <span className="block text-[10px] font-normal text-muted-foreground/70">
                          {t('ledger.clearedOn', { date: formatShortDate(tx.clearedDate) })}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        {childCount > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpanded(tx.id);
                            }}
                            aria-expanded={isExpanded}
                            aria-label={
                              payments.length > 0
                                ? t('ledger.showPayments', { n: payments.length })
                                : t('ledger.showRefunds', { n: refunds.length })
                            }
                            className="text-muted-foreground hover:text-foreground shrink-0 -ml-1"
                          >
                            <ChevronRight
                              size={14}
                              className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                            />
                          </button>
                        )}
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded whitespace-nowrap ${
                            CATEGORY_COLORS[tx.category] || 'bg-muted text-foreground'
                          }`}
                        >
                          {CATEGORY_LABELS[tx.category] || tx.category}
                        </span>
                        <span className="text-sm font-semibold text-foreground truncate max-w-[250px]">{tx.title}</span>
                        <RefundBadge tx={tx} />
                        <PlanBadge tx={tx} />
                      </div>
                      {tx.category === 'TRF' && <TransferBadge tx={tx} />}
                      {tx.eventTitle && (
                        <p className="text-xs text-blue-700 dark:text-blue-400 font-semibold mt-0.5 flex items-center gap-1">
                          <Link2 size={9} /> {tx.eventTitle}
                        </p>
                      )}
                      {tx.notes && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[350px]">{tx.notes}</p>
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs text-foreground">{tx.playerName || '—'}</td>
                    <td className="px-5 py-3 text-xs text-foreground whitespace-nowrap">
                      {tx.category === 'TRF' ? (
                        <span className="inline-flex items-center gap-1">
                          <span>{accountMap[tx.transferFromAccountId]?.name || '—'}</span>
                          <ArrowRightLeft size={10} className="text-indigo-400 shrink-0" />
                          <span>{accountMap[tx.transferToAccountId]?.name || '—'}</span>
                        </span>
                      ) : (
                        accountMap[tx.accountId]?.name || '—'
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {tx.cleared ? (
                        <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 text-xs font-semibold">
                          <CheckCircle2 size={12} /> {t('ledger.cleared')}
                        </span>
                      ) : onPlan ? (
                        // An obligation on a plan is never cleared — the money is
                        // in its payments — so "Pending" would read as though
                        // nothing had been collected. Show the balance instead.
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-semibold ${
                            plan.complete
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-blue-700 dark:text-blue-400'
                          }`}
                        >
                          <HandCoins size={12} />{' '}
                          {plan.complete
                            ? t('ledger.paidInFull')
                            : t('ledger.amountLeft', { amount: formatMoney(plan.remaining) })}
                        </span>
                      ) : isDraft ? (
                        <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 text-xs font-bold">
                          <Clock size={12} /> {t('ledger.draft')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 text-xs font-semibold">
                          <Clock size={12} /> {t('ledger.pending')}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      <span
                        className={`text-sm font-bold ${amountColor(tx)} ${refunds.length > 0 ? 'line-through opacity-60' : ''}`}
                      >
                        {tx.category === 'TRF' && '↔ '}
                        {tx.amount < 0 ? '-' : tx.category !== 'TRF' ? '+' : ''}
                        {formatMoney(Math.abs(tx.amount))}
                      </span>
                      {refunds.length > 0 && (
                        <span className="block text-sm font-bold text-foreground">{formatSigned(net)}</span>
                      )}
                      {onPlan && !plan.complete && (
                        <span className="block text-xs font-semibold text-muted-foreground">
                          {t('ledger.amountLeft', { amount: formatMoney(plan.remaining) })}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      {onRecordPayment && canRecordPayment(tx, installmentIndex) && (
                        <button
                          onClick={() => onRecordPayment(tx)}
                          title={t('ledger.recordPayment')}
                          aria-label={t('ledger.recordPayment')}
                          className="p-1 text-muted-foreground transition-colors hover:text-emerald-700 dark:hover:text-emerald-400"
                        >
                          <HandCoins size={14} />
                        </button>
                      )}
                      {onRefundTx && canRefund(tx, refundIndex) && !blocksRefund(tx, installmentIndex) && (
                        <button
                          onClick={() => onRefundTx(tx)}
                          title={t('ledger.refund')}
                          aria-label={t('ledger.refund')}
                          className="text-muted-foreground hover:text-amber-700 dark:hover:text-amber-400 transition-colors p-1"
                        >
                          <Undo2 size={14} />
                        </button>
                      )}
                      {onDeleteTx && (
                        <button
                          onClick={() => onDeleteTx(tx.id)}
                          title={t('common.delete')}
                          aria-label={t('common.delete')}
                          className="text-muted-foreground hover:text-red-700 dark:text-red-400 transition-colors p-1"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                  {isExpanded &&
                    payments.map((p) => (
                      <tr key={p.id} className="bg-emerald-50/40 text-xs dark:bg-emerald-900/10">
                        <td className="whitespace-nowrap px-5 py-2 font-medium text-muted-foreground">
                          {p.date?.seconds
                            ? new Date(p.date.seconds * 1000).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: '2-digit',
                              })
                            : '—'}
                        </td>
                        <td className="px-5 py-2" colSpan={2}>
                          <span className="inline-flex items-center gap-2 pl-5">
                            <HandCoins size={12} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                            <span className="font-semibold text-foreground">{p.title}</span>
                            {p.notes && <span className="max-w-[240px] truncate text-muted-foreground">{p.notes}</span>}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-5 py-2 text-foreground">
                          {accountMap[p.accountId]?.name || '—'}
                        </td>
                        <td className="px-5 py-2">
                          {p.cleared ? (
                            <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
                              <CheckCircle2 size={11} /> {t('ledger.cleared')}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-semibold text-amber-700 dark:text-amber-400">
                              <Clock size={11} /> {t('ledger.pending')}
                            </span>
                          )}
                        </td>
                        <td className={`whitespace-nowrap px-5 py-2 text-right font-bold ${amountColor(p)}`}>
                          {formatSigned(p.amount)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-center">
                          {onDeleteTx && (
                            <button
                              onClick={() => onDeleteTx(p.id)}
                              title={t('ledger.deletePayment')}
                              aria-label={t('ledger.deletePayment')}
                              className="p-1 text-muted-foreground transition-colors hover:text-red-700 dark:hover:text-red-400"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  {isExpanded &&
                    refunds.map((r) => (
                      <tr key={r.id} className="bg-amber-50/40 dark:bg-amber-900/10 text-xs">
                        <td className="px-5 py-2 font-medium text-muted-foreground whitespace-nowrap">
                          {r.date?.seconds
                            ? new Date(r.date.seconds * 1000).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: '2-digit',
                              })
                            : '—'}
                        </td>
                        <td className="px-5 py-2" colSpan={3}>
                          <span className="inline-flex items-center gap-2 pl-5">
                            <Undo2 size={12} className="text-amber-600 dark:text-amber-400 shrink-0" />
                            <span className="font-semibold text-foreground">{r.title}</span>
                            {r.notes && <span className="text-muted-foreground truncate max-w-[280px]">{r.notes}</span>}
                          </span>
                        </td>
                        <td className="px-5 py-2">
                          {r.cleared ? (
                            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold">
                              <CheckCircle2 size={11} /> {t('ledger.cleared')}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-semibold">
                              <Clock size={11} /> {t('ledger.pending')}
                            </span>
                          )}
                        </td>
                        <td className={`px-5 py-2 text-right font-bold whitespace-nowrap ${amountColor(r)}`}>
                          {formatSigned(r.amount)}
                        </td>
                        <td className="px-3 py-2 text-center whitespace-nowrap">
                          {onDeleteTx && (
                            <button
                              onClick={() => onDeleteTx(r.id)}
                              title={t('ledger.undoRefund')}
                              aria-label={t('ledger.undoRefund')}
                              className="text-muted-foreground hover:text-red-700 dark:hover:text-red-400 transition-colors p-1"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                </React.Fragment>
              );
            })}
            {pagedRows.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-10 text-muted-foreground text-sm font-semibold">
                  {hasActiveFilters ? t('ledger.noFilterMatch') : t('ledger.noTransactions')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── MOBILE CARDS ── */}
      <div className="md:hidden space-y-2">
        {pagedRows.map(({ tx, refunds, payments }) => {
          const isDraft = !tx.cleared && tx.eventId;
          const isExpanded = expandedIds.has(tx.id);
          const net = netOf(tx, refunds);
          const onPlan = hasPaymentPlan(tx, installmentIndex);
          const plan = planProgress(tx, installmentIndex);
          const childCount = refunds.length + payments.length;
          return (
            <div
              key={tx.id}
              onClick={() => onEditTx(tx)}
              className={`bg-card rounded-lg border p-4 active:bg-muted transition-colors ${isDraft ? 'border-amber-300 dark:border-amber-600 border-dashed' : 'border-border'}`}
            >
              <div className="flex justify-between items-start gap-2 mb-2">
                <div className="min-w-0 flex-grow">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded shrink-0 ${
                        CATEGORY_COLORS[tx.category] || 'bg-muted text-foreground'
                      }`}
                    >
                      {CATEGORY_LABELS[tx.category] || tx.category}
                    </span>
                    {tx.cleared ? (
                      <CheckCircle2 size={12} className="text-emerald-700 dark:text-emerald-400 shrink-0" />
                    ) : isDraft ? (
                      <span className="text-xs font-bold text-amber-700 dark:text-amber-400 bg-amber-50 px-1.5 py-0.5 rounded shrink-0">
                        DRAFT
                      </span>
                    ) : onPlan ? null : (
                      <Clock size={12} className="text-amber-400 shrink-0" />
                    )}
                    <RefundBadge tx={tx} />
                    <PlanBadge tx={tx} />
                  </div>
                  <p className="text-sm font-semibold text-foreground truncate">{tx.title}</p>
                  {tx.category === 'TRF' && <TransferBadge tx={tx} />}
                  {tx.eventTitle && (
                    <p className="text-xs text-blue-700 dark:text-blue-400 font-semibold mt-0.5 flex items-center gap-1">
                      <Link2 size={9} /> {tx.eventTitle}
                    </p>
                  )}
                </div>
                <div className="text-right whitespace-nowrap">
                  <span
                    className={`text-sm font-bold ${amountColor(tx)} ${refunds.length > 0 ? 'line-through opacity-60' : ''}`}
                  >
                    {tx.category === 'TRF' && '↔ '}
                    {tx.amount < 0 ? '-' : tx.category !== 'TRF' ? '+' : ''}
                    {formatMoney(Math.abs(tx.amount))}
                  </span>
                  {refunds.length > 0 && (
                    <span className="block text-sm font-bold text-foreground">{formatSigned(net)}</span>
                  )}
                  {onPlan && (
                    <span
                      className={`block text-xs font-semibold ${
                        plan.complete ? 'text-emerald-700 dark:text-emerald-400' : 'text-muted-foreground'
                      }`}
                    >
                      {plan.complete
                        ? t('ledger.paidInFull')
                        : t('ledger.amountLeft', { amount: formatMoney(plan.remaining) })}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground font-medium">
                <span>
                  {tx.date?.seconds
                    ? new Date(tx.date.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : '—'}
                  {hasSplitDates(tx) && (
                    <span className="ml-1 text-muted-foreground/70">
                      {t('ledger.clearedOn', { date: formatShortDate(tx.clearedDate) })}
                    </span>
                  )}
                </span>
                {tx.playerName && (
                  <>
                    <span>·</span>
                    <span>{tx.playerName}</span>
                  </>
                )}
                {accountMap[tx.accountId]?.name && (
                  <>
                    <span>·</span>
                    <span>{accountMap[tx.accountId].name}</span>
                  </>
                )}
                {onRecordPayment && canRecordPayment(tx, installmentIndex) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRecordPayment(tx);
                    }}
                    className="ml-auto inline-flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-400"
                  >
                    <HandCoins size={12} /> {t('ledger.payment')}
                  </button>
                )}
                {onRefundTx && canRefund(tx, refundIndex) && !blocksRefund(tx, installmentIndex) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onRefundTx(tx);
                    }}
                    className="ml-auto inline-flex items-center gap-1 font-bold text-amber-700 dark:text-amber-400"
                  >
                    <Undo2 size={12} /> {t('ledger.refund')}
                  </button>
                )}
                {childCount > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpanded(tx.id);
                    }}
                    aria-expanded={isExpanded}
                    className={`ml-auto inline-flex items-center gap-1 font-bold ${
                      payments.length > 0
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    <ChevronRight size={12} className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                    {payments.length > 0
                      ? t('ledger.paymentCount', { n: payments.length })
                      : t('ledger.refundCount', { n: refunds.length })}
                  </button>
                )}
              </div>

              {isExpanded && payments.length > 0 && (
                <div className="mt-2 space-y-2 border-t border-dashed border-emerald-300 pt-2 dark:border-emerald-700">
                  {payments.map((p) => (
                    <div key={p.id} className="flex items-start justify-between gap-2 text-xs">
                      <span className="inline-flex min-w-0 items-start gap-1.5">
                        <HandCoins size={11} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-foreground">{p.title}</span>
                          <span className="block text-muted-foreground">
                            {p.date?.seconds
                              ? new Date(p.date.seconds * 1000).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                })
                              : '—'}
                            {p.cleared ? ` · ${t('ledger.cleared')}` : ` · ${t('ledger.pending')}`}
                          </span>
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <span className={`font-bold ${amountColor(p)}`}>{formatSigned(p.amount)}</span>
                        {onDeleteTx && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteTx(p.id);
                            }}
                            aria-label={t('ledger.deletePayment')}
                            className="p-0.5 text-muted-foreground"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {isExpanded && refunds.length > 0 && (
                <div className="mt-2 pt-2 border-t border-dashed border-amber-300 dark:border-amber-700 space-y-2">
                  {refunds.map((r) => (
                    <div key={r.id} className="flex items-start justify-between gap-2 text-xs">
                      <span className="inline-flex items-start gap-1.5 min-w-0">
                        <Undo2 size={11} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <span className="min-w-0">
                          <span className="block font-semibold text-foreground truncate">{r.title}</span>
                          <span className="block text-muted-foreground">
                            {r.date?.seconds
                              ? new Date(r.date.seconds * 1000).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                })
                              : '—'}
                            {r.cleared ? ` · ${t('ledger.cleared')}` : ` · ${t('ledger.pending')}`}
                          </span>
                        </span>
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        <span className={`font-bold ${amountColor(r)}`}>{formatSigned(r.amount)}</span>
                        {onDeleteTx && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteTx(r.id);
                            }}
                            aria-label={t('ledger.undoRefund')}
                            className="text-muted-foreground p-0.5"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {pagedRows.length === 0 && (
          <div className="text-center py-10 text-muted-foreground text-sm font-semibold">
            {hasActiveFilters ? t('ledger.noFilterMatch') : t('ledger.noTransactions')}
          </div>
        )}
      </div>

      {/* ── PAGINATION ── */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 pt-2">
          <button
            onClick={() => setCurrentPage(1)}
            disabled={safePage === 1}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronsLeft size={16} />
          </button>
          <button
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            disabled={safePage === 1}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs font-semibold text-muted-foreground px-3">
            Page {safePage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={safePage === totalPages}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronRight size={16} />
          </button>
          <button
            onClick={() => setCurrentPage(totalPages)}
            disabled={safePage === totalPages}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <ChevronsRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
