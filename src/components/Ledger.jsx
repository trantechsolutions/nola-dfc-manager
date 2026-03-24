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
} from 'lucide-react';
import { useT } from '../i18n/I18nContext';

const DEFAULT_CATEGORY_COLORS = {
  TMF: 'bg-blue-50 text-blue-700',
  SPO: 'bg-violet-50 text-violet-700',
  FUN: 'bg-emerald-50 text-emerald-700',
  OPE: 'bg-slate-100 text-slate-600',
  TOU: 'bg-amber-50 text-amber-700',
  LEA: 'bg-orange-50 text-orange-700',
  CRE: 'bg-cyan-50 text-cyan-700',
  FRI: 'bg-rose-50 text-rose-700',
  TRF: 'bg-indigo-50 text-indigo-700',
};

export default function Ledger({
  transactions,
  onEditTx,
  onDeleteTx,
  formatMoney,
  categoryLabels: propLabels, // NEW: dynamic labels from useCategoryManager
  categoryColors: propColors, // NEW: dynamic colors from useCategoryManager
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

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [flowFilter, setFlowFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 20;

  const filteredTransactions = useMemo(() => {
    let result = [...transactions];

    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      result = result.filter(
        (tx) =>
          tx.title?.toLowerCase().includes(q) ||
          tx.playerName?.toLowerCase().includes(q) ||
          tx.notes?.toLowerCase().includes(q) ||
          tx.transferFrom?.toLowerCase().includes(q) ||
          tx.transferTo?.toLowerCase().includes(q),
      );
    }

    if (categoryFilter !== 'all') {
      result = result.filter((tx) => tx.category === categoryFilter);
    }

    if (flowFilter === 'income') result = result.filter((tx) => tx.amount > 0 && tx.category !== 'TRF');
    if (flowFilter === 'expense') result = result.filter((tx) => tx.amount < 0 && tx.category !== 'TRF');
    if (flowFilter === 'transfer') result = result.filter((tx) => tx.category === 'TRF');

    if (statusFilter === 'cleared') result = result.filter((tx) => tx.cleared);
    if (statusFilter === 'pending') result = result.filter((tx) => !tx.cleared);

    result.sort((a, b) => {
      const dateA = a.date?.seconds || 0;
      const dateB = b.date?.seconds || 0;
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
    });

    return result;
  }, [transactions, searchTerm, categoryFilter, flowFilter, statusFilter, sortOrder]);

  const totalIncome = filteredTransactions
    .filter((tx) => tx.amount > 0 && tx.category !== 'TRF')
    .reduce((s, tx) => s + tx.amount, 0);
  const totalExpense = filteredTransactions
    .filter((tx) => tx.amount < 0 && tx.category !== 'TRF')
    .reduce((s, tx) => s + tx.amount, 0);

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pagedTransactions = filteredTransactions.slice((safePage - 1) * pageSize, safePage * pageSize);

  const hasActiveFilters = searchTerm || categoryFilter !== 'all' || flowFilter !== 'all' || statusFilter !== 'all';
  const clearAllFilters = () => {
    setSearchTerm('');
    setCategoryFilter('all');
    setFlowFilter('all');
    setStatusFilter('all');
    setCurrentPage(1);
  };
  const setFilterAndReset = (setter) => (val) => {
    setter(val);
    setCurrentPage(1);
  };

  const TransferBadge = ({ tx }) => (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
      {tx.transferFrom} <ArrowRightLeft size={10} /> {tx.transferTo}
    </span>
  );

  const amountColor = (tx) => {
    if (tx.category === 'TRF') return 'text-indigo-600';
    return tx.amount < 0 ? 'text-red-500' : 'text-emerald-600';
  };

  return (
    <div className="space-y-4 pb-20 md:pb-6">
      {/* ── TOOLBAR ── */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
          <input
            type="text"
            placeholder={t('ledger.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none dark:text-white"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3 top-2.5 text-slate-300 hover:text-slate-500"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <div className="flex items-center gap-1">
            <Filter size={13} className="text-slate-400" />
            <select
              value={categoryFilter}
              onChange={(e) => setFilterAndReset(setCategoryFilter)(e.target.value)}
              className="bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-xs font-bold rounded-lg px-2 py-1.5 focus:ring-0 cursor-pointer dark:text-white"
            >
              <option value="all">{t('ledger.allCategories')}</option>
              {Object.entries(CATEGORY_LABELS).map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
            {[
              { val: 'all', label: t('common.all') },
              { val: 'income', label: t('ledger.income') },
              { val: 'expense', label: t('ledger.expense') },
              { val: 'transfer', label: t('ledger.transfers') },
            ].map((opt) => (
              <button
                key={opt.val}
                onClick={() => setFilterAndReset(setFlowFilter)(opt.val)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                  flowFilter === opt.val
                    ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
            {[
              { val: 'all', label: t('common.all') },
              { val: 'cleared', label: t('ledger.cleared') },
              { val: 'pending', label: t('ledger.pending') },
            ].map((opt) => (
              <button
                key={opt.val}
                onClick={() => setFilterAndReset(setStatusFilter)(opt.val)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${
                  statusFilter === opt.val
                    ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-[11px] font-bold transition-colors ml-auto dark:text-slate-300"
          >
            <ArrowUpDown size={12} />
            {sortOrder === 'desc' ? t('ledger.newest') : t('ledger.oldest')}
          </button>
        </div>

        {hasActiveFilters && (
          <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-700">
            <span className="text-[11px] text-slate-500 font-bold">
              {filteredTransactions.length} result{filteredTransactions.length !== 1 && 's'}
              <span className="text-emerald-600 ml-3">+{formatMoney(totalIncome)}</span>
              <span className="text-red-500 ml-2">{formatMoney(totalExpense)}</span>
            </span>
            <button
              onClick={clearAllFilters}
              className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1"
            >
              <X size={12} /> {t('common.clearFilters')}
            </button>
          </div>
        )}
      </div>

      {/* ── DESKTOP TABLE ── */}
      <div className="hidden md:block bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            <tr>
              <th className="px-5 py-3.5">{t('common.date')}</th>
              <th className="px-5 py-3.5">{t('ledger.transaction')}</th>
              <th className="px-5 py-3.5">{t('ledger.player')}</th>
              <th className="px-5 py-3.5">{t('common.status')}</th>
              <th className="px-5 py-3.5 text-right">{t('common.amount')}</th>
              <th className="px-3 py-3.5 text-center w-14"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
            {pagedTransactions.map((tx) => {
              const isDraft = !tx.cleared && tx.eventId;
              return (
                <tr
                  key={tx.id}
                  className={`hover:bg-blue-50/30 dark:hover:bg-slate-800 transition-colors cursor-pointer ${isDraft ? 'border-l-2 border-l-amber-400 bg-amber-50/20 dark:bg-amber-900/20' : ''}`}
                  onClick={() => onEditTx(tx)}
                >
                  <td className="px-5 py-3 text-xs font-medium text-slate-500 whitespace-nowrap">
                    {tx.date?.seconds
                      ? new Date(tx.date.seconds * 1000).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: '2-digit',
                        })
                      : '—'}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded whitespace-nowrap ${
                          CATEGORY_COLORS[tx.category] || 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {CATEGORY_LABELS[tx.category] || tx.category}
                      </span>
                      <span className="text-sm font-bold text-slate-800 dark:text-white truncate max-w-[250px]">
                        {tx.title}
                      </span>
                    </div>
                    {tx.category === 'TRF' && <TransferBadge tx={tx} />}
                    {tx.eventTitle && (
                      <p className="text-[10px] text-blue-600 font-bold mt-0.5 flex items-center gap-1">
                        <Link2 size={9} /> {tx.eventTitle}
                      </p>
                    )}
                    {tx.notes && <p className="text-[11px] text-slate-400 mt-0.5 truncate max-w-[350px]">{tx.notes}</p>}
                  </td>
                  <td className="px-5 py-3 text-xs text-slate-600">{tx.playerName || '—'}</td>
                  <td className="px-5 py-3">
                    {tx.cleared ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 text-[11px] font-bold">
                        <CheckCircle2 size={12} /> {t('ledger.cleared')}
                      </span>
                    ) : isDraft ? (
                      <span className="inline-flex items-center gap-1 text-amber-600 text-[11px] font-black">
                        <Clock size={12} /> {t('ledger.draft')}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-500 text-[11px] font-bold">
                        <Clock size={12} /> {t('ledger.pending')}
                      </span>
                    )}
                  </td>
                  <td className={`px-5 py-3 text-right text-sm font-black whitespace-nowrap ${amountColor(tx)}`}>
                    {tx.category === 'TRF' && '↔ '}
                    {tx.amount < 0 ? '-' : tx.category !== 'TRF' ? '+' : ''}
                    {formatMoney(Math.abs(tx.amount))}
                  </td>
                  <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                    {onDeleteTx && (
                      <button
                        onClick={() => onDeleteTx(tx.id)}
                        className="text-slate-300 hover:text-red-500 transition-colors p-1"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {pagedTransactions.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-10 text-slate-400 text-sm font-bold">
                  {hasActiveFilters ? t('ledger.noFilterMatch') : t('ledger.noTransactions')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── MOBILE CARDS ── */}
      <div className="md:hidden space-y-2">
        {pagedTransactions.map((tx) => {
          const isDraft = !tx.cleared && tx.eventId;
          return (
            <div
              key={tx.id}
              onClick={() => onEditTx(tx)}
              className={`bg-white dark:bg-slate-900 rounded-xl border p-4 active:bg-slate-50 dark:active:bg-slate-800 transition-colors ${isDraft ? 'border-amber-300 dark:border-amber-600 border-dashed' : 'border-slate-200 dark:border-slate-700'}`}
            >
              <div className="flex justify-between items-start gap-2 mb-2">
                <div className="min-w-0 flex-grow">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded shrink-0 ${
                        CATEGORY_COLORS[tx.category] || 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {CATEGORY_LABELS[tx.category] || tx.category}
                    </span>
                    {tx.cleared ? (
                      <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                    ) : isDraft ? (
                      <span className="text-[9px] font-black text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded shrink-0">
                        DRAFT
                      </span>
                    ) : (
                      <Clock size={12} className="text-amber-400 shrink-0" />
                    )}
                  </div>
                  <p className="text-sm font-bold text-slate-800 dark:text-white truncate">{tx.title}</p>
                  {tx.category === 'TRF' && <TransferBadge tx={tx} />}
                  {tx.eventTitle && (
                    <p className="text-[10px] text-blue-600 font-bold mt-0.5 flex items-center gap-1">
                      <Link2 size={9} /> {tx.eventTitle}
                    </p>
                  )}
                </div>
                <span className={`text-sm font-black whitespace-nowrap ${amountColor(tx)}`}>
                  {tx.category === 'TRF' && '↔ '}
                  {tx.amount < 0 ? '-' : tx.category !== 'TRF' ? '+' : ''}
                  {formatMoney(Math.abs(tx.amount))}
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-slate-400 font-medium">
                <span>
                  {tx.date?.seconds
                    ? new Date(tx.date.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                    : '—'}
                </span>
                {tx.playerName && (
                  <>
                    <span>·</span>
                    <span>{tx.playerName}</span>
                  </>
                )}
                {tx.type && (
                  <>
                    <span>·</span>
                    <span>{tx.type}</span>
                  </>
                )}
              </div>
            </div>
          );
        })}
        {pagedTransactions.length === 0 && (
          <div className="text-center py-10 text-slate-400 text-sm font-bold">
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
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 disabled:opacity-30"
          >
            <ChevronsLeft size={16} />
          </button>
          <button
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            disabled={safePage === 1}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 disabled:opacity-30"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs font-bold text-slate-500 px-3">
            Page {safePage} of {totalPages}
          </span>
          <button
            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={safePage === totalPages}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 disabled:opacity-30"
          >
            <ChevronRight size={16} />
          </button>
          <button
            onClick={() => setCurrentPage(totalPages)}
            disabled={safePage === totalPages}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 disabled:opacity-30"
          >
            <ChevronsRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
