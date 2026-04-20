import React, { useState, useMemo } from 'react';
import { Plus, CalendarDays, X, Upload, Tag } from 'lucide-react';
import Ledger from '../../components/Ledger';
import BulkUploadLedgerModal from '../../components/BulkUploadLedgerModal';
import ExportMenu from '../../components/ExportMenu';
import { useT } from '../../i18n/I18nContext';

export default function LedgerView({
  transactions,
  onAddTx,
  onEditTx,
  onDeleteTx,
  formatMoney,
  // Dynamic categories
  categoryLabels,
  categoryColors,
  categoryOptions,
  // Bulk upload
  players,
  onBulkUpload,
  selectedSeason,
  teamSeasonId,
  showToast,
  // Export
  calculatePlayerFinancials,
  // Category management
  onManageCategories,
  // Accounts
  accounts = [],
  activeAccounts = [],
  accountsByHolding = { digital: [], bank: [], cash: [], none: [] },
  accountMap = {},
}) {
  const { t } = useT();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showDateRange, setShowDateRange] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (tx.waterfallBatchId) return false;

      if (!startDate && !endDate) return true;

      let txDateStr = '';
      if (tx.date && tx.date.seconds) {
        txDateStr = new Date(tx.date.seconds * 1000).toISOString().split('T')[0];
      } else if (tx.date instanceof Date) {
        txDateStr = tx.date.toISOString().split('T')[0];
      } else if (typeof tx.date === 'string') {
        txDateStr = tx.date.split('T')[0];
      }

      if (!txDateStr) return true;
      if (startDate && txDateStr < startDate) return false;
      if (endDate && txDateStr > endDate) return false;
      return true;
    });
  }, [transactions, startDate, endDate]);

  const filteredTotal = filteredTransactions.reduce((sum, tx) => sum + tx.amount, 0);
  const hasDateFilter = startDate || endDate;

  return (
    <div className="space-y-4">
      {/* ── HEADER ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white">{t('ledger.title')}</h2>
          <p className="text-xs text-slate-400 font-bold mt-0.5">
            {filteredTransactions.length}{' '}
            {filteredTransactions.length === 1 ? t('ledger.transaction') : t('ledger.transactions')}
            {hasDateFilter && <span className="text-blue-500"> {t('ledger.dateFiltered')}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
          {/* Manage Categories button (admin only) */}
          {onManageCategories && (
            <button
              onClick={onManageCategories}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
            >
              <Tag size={14} />
              <span className="hidden sm:inline">{t('nav.categories')}</span>
            </button>
          )}
          {/* Date Range filter */}
          <button
            onClick={() => setShowDateRange(!showDateRange)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${
              hasDateFilter
                ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-700 text-blue-700'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <CalendarDays size={14} />
            {hasDateFilter ? t('ledger.dateActive') : t('ledger.dateRange')}
          </button>
          {/* Bulk Upload button */}
          {onBulkUpload && (
            <button
              onClick={() => setShowBulkUpload(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
            >
              <Upload size={14} />
              <span className="hidden sm:inline">{t('ledger.bulkUpload')}</span>
            </button>
          )}
          {/* Export menu */}
          <ExportMenu
            transactions={filteredTransactions}
            players={players}
            calculatePlayerFinancials={calculatePlayerFinancials}
            formatMoney={formatMoney}
            seasonInfo={{ name: selectedSeason || 'All' }}
          />
          {/* Add Transaction button */}
          {onAddTx && (
            <button
              onClick={onAddTx}
              className="flex-1 sm:flex-none bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-4 py-2 rounded-xl font-bold text-xs hover:bg-slate-800 dark:hover:bg-slate-200 flex items-center justify-center gap-1.5 transition-all"
            >
              <Plus size={14} /> {t('ledger.addTransaction')}
            </button>
          )}
        </div>
      </div>

      {/* ── DATE RANGE PANEL ── */}
      {showDateRange && (
        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none flex flex-col sm:flex-row gap-3 items-end">
          <div className="w-full sm:w-40">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
              {t('ledger.from')}
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <div className="w-full sm:w-40">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
              {t('ledger.to')}
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-white"
            />
          </div>
          {hasDateFilter && (
            <button
              onClick={() => {
                setStartDate('');
                setEndDate('');
              }}
              className="text-xs font-bold text-red-500 hover:text-red-700 flex items-center gap-1 px-2 py-2"
            >
              <X size={12} /> {t('common.clear')}
            </button>
          )}
        </div>
      )}

      {/* Date filter summary */}
      {hasDateFilter && (
        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-700 p-3 rounded-xl flex justify-between items-center">
          <span className="text-blue-800 text-xs font-bold">
            {t('ledger.resultsInRange', { n: filteredTransactions.length })}
          </span>
          <span className={`text-sm font-black ${filteredTotal >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {t('ledger.net')} {formatMoney(filteredTotal)}
          </span>
        </div>
      )}

      {/* ── TABLE ── */}
      <Ledger
        transactions={filteredTransactions}
        onEditTx={onEditTx}
        onDeleteTx={onDeleteTx}
        formatMoney={formatMoney}
        categoryLabels={categoryLabels}
        categoryColors={categoryColors}
        accounts={accounts}
        accountMap={accountMap}
      />

      {/* ── BULK UPLOAD MODAL ── */}
      <BulkUploadLedgerModal
        show={showBulkUpload}
        onClose={() => setShowBulkUpload(false)}
        onComplete={() => setShowBulkUpload(false)}
        players={players || []}
        categoryLabels={categoryLabels || {}}
        categoryColors={categoryColors || {}}
        selectedSeason={selectedSeason}
        teamSeasonId={teamSeasonId}
        onBulkSave={onBulkUpload}
        showToast={showToast}
        activeAccounts={activeAccounts}
      />
    </div>
  );
}
