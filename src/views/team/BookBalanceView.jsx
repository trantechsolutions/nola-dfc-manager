import React, { useState, useMemo } from 'react';
import {
  Lock,
  Unlock,
  ChevronDown,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  Info,
  ArrowRight,
  FileSearch,
} from 'lucide-react';
import AccountBalanceCard from '../../components/AccountBalanceCard';
import BankAggregateCard from '../../components/BankAggregateCard';
import StatementImportModal from '../../components/StatementImportModal';
import { useT } from '../../i18n/I18nContext';
import { TRACKED_HOLDINGS } from '../../utils/holdings';
import { monthKeyToLabel, SEASON_KEY } from '../../utils/computeBookBalance';

export default function BookBalanceView({
  monthOptions,
  selectedMonth,
  setSelectedMonth,
  ledgerBalances,
  storedByAccount,
  // bank aggregate props
  bankAccounts = [],
  bankLedgerTotal = 0,
  bankStoredRow = null,
  saveBankBalance,
  isSeasonView = false,
  isMonthLocked,
  loading,
  isSaving,
  saveBalance,
  lockMonth,
  unlockMonth,
  accounts = [],
  transactions = [],
  formatMoney,
  showConfirm,
  isSuperAdmin = false,
}) {
  const { t } = useT();
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [statementAccount, setStatementAccount] = useState(null);

  // Non-bank tracked accounts (digital, cash) — each gets its own card
  const nonBankAccounts = useMemo(
    () => accounts.filter((a) => TRACKED_HOLDINGS.includes(a.holding) && a.holding !== 'bank' && a.isActive),
    [accounts],
  );

  const hasBankAccounts = bankAccounts.length > 0;

  // Total reconcilable "slots": 1 bank aggregate slot + each non-bank account
  const totalSlots = (hasBankAccounts ? 1 : 0) + nonBankAccounts.length;

  // Compute totals + reconciliation status
  const { totals, balancedCount, enteredCount } = useMemo(() => {
    let totalLedger = 0;
    let totalStated = 0;
    let balanced = 0;
    let entered = 0;

    // Bank aggregate slot
    if (hasBankAccounts) {
      totalLedger += bankLedgerTotal;
      if (bankStoredRow) {
        entered++;
        totalStated += bankStoredRow.statedBalance;
        if (Math.abs(bankStoredRow.statedBalance - bankLedgerTotal) < 0.01) balanced++;
      }
    }

    // Non-bank individual accounts
    for (const acct of nonBankAccounts) {
      totalLedger += ledgerBalances[acct.id] ?? 0;
      const stored = storedByAccount[acct.id];
      if (stored) {
        entered++;
        totalStated += stored.statedBalance;
        if (Math.abs(stored.statedBalance - (ledgerBalances[acct.id] ?? 0)) < 0.01) balanced++;
      }
    }

    return {
      totals: { totalLedger, totalStated, delta: totalStated - totalLedger },
      balancedCount: balanced,
      enteredCount: entered,
    };
  }, [hasBankAccounts, bankLedgerTotal, bankStoredRow, nonBankAccounts, ledgerBalances, storedByAccount]);

  const totalAccounts = totalSlots;
  const allEntered = enteredCount === totalAccounts && totalAccounts > 0;
  const allBalanced = balancedCount === totalAccounts && totalAccounts > 0;
  const totalIsBalanced = Math.abs(totals.delta) < 0.01 && allEntered;

  function handleLockClick() {
    showConfirm(t('bookBalance.lockMonthConfirm', { month: monthKeyToLabel(selectedMonth) }), lockMonth);
  }

  function handleUnlockClick() {
    showConfirm(t('bookBalance.unlockMonthConfirm', { month: monthKeyToLabel(selectedMonth) }), unlockMonth);
  }

  return (
    <div className="space-y-5 max-w-5xl">
      {/* ══ HEADER ══ */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-black text-slate-900 dark:text-white leading-tight">
              {t('bookBalance.title')}
            </h2>
            {isMonthLocked && (
              <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                <Lock size={10} aria-hidden="true" />
                {t('bookBalance.lockedBadge')}
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-1">{t('bookBalance.subtitle')}</p>
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {/* How it works toggle */}
          <button
            onClick={() => setShowInstructions((p) => !p)}
            aria-expanded={showInstructions}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
          >
            <Info size={13} aria-hidden="true" />
            {t('bookBalance.howItWorks')}
          </button>

          {/* Month picker */}
          <div className="relative">
            <button
              onClick={() => setShowMonthPicker((p) => !p)}
              aria-haspopup="listbox"
              aria-expanded={showMonthPicker}
              aria-label={`Selected month: ${monthKeyToLabel(selectedMonth)}`}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all"
            >
              <BookOpen size={13} aria-hidden="true" />
              {monthKeyToLabel(selectedMonth)}
              <ChevronDown
                size={12}
                className={`transition-transform duration-150 ${showMonthPicker ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
            {showMonthPicker && (
              <ul
                role="listbox"
                aria-label="Select month"
                className="absolute right-0 top-full mt-1 z-50 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden min-w-[176px] max-h-64 overflow-y-auto"
              >
                {monthOptions.map((key) => (
                  <li key={key} role="option" aria-selected={key === selectedMonth}>
                    <button
                      onClick={() => {
                        setSelectedMonth(key);
                        setShowMonthPicker(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${
                        key === selectedMonth
                          ? 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
                          : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {monthKeyToLabel(key)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Lock / Unlock — not available in season view */}
          {!isSeasonView &&
            (isMonthLocked ? (
              isSuperAdmin && (
                <button
                  onClick={handleUnlockClick}
                  disabled={isSaving}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 disabled:opacity-40 transition-all focus:outline-none focus:ring-2 focus:ring-amber-400"
                >
                  <Unlock size={13} aria-hidden="true" />
                  {t('bookBalance.unlockMonth')}
                </button>
              )
            ) : (
              <button
                onClick={handleLockClick}
                disabled={isSaving || totalAccounts === 0}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition-all
                bg-slate-900 dark:bg-white text-white dark:text-slate-900
                hover:bg-slate-700 dark:hover:bg-slate-100
                disabled:opacity-30 disabled:cursor-not-allowed
                focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-slate-700 dark:focus:ring-white"
              >
                <Lock size={13} aria-hidden="true" />
                {t('bookBalance.lockMonth')}
              </button>
            ))}
        </div>
      </div>

      {/* ══ HOW IT WORKS ══ */}
      {showInstructions && (
        <div
          role="region"
          aria-label="How book balance works"
          className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-2xl p-5"
        >
          <p className="text-xs font-black text-blue-700 dark:text-blue-300 uppercase tracking-widest mb-3">
            {t('bookBalance.howItWorks')}
          </p>
          <ol className="space-y-2.5" aria-label="Steps">
            {[t('bookBalance.step1'), t('bookBalance.step2'), t('bookBalance.step3')].map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="shrink-0 w-5 h-5 rounded-full bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-200 text-[10px] font-black flex items-center justify-center mt-0.5">
                  {i + 1}
                </span>
                <p className="text-sm text-blue-800 dark:text-blue-200 font-medium leading-snug">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* ══ STATUS BAR ══ */}
      {totalAccounts > 0 && !isMonthLocked && !isSeasonView && (
        <div
          className={`flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-semibold transition-all ${
            allBalanced
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
              : enteredCount > 0
                ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300'
                : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'
          }`}
          role="status"
          aria-live="polite"
        >
          {allBalanced ? (
            <CheckCircle2 size={16} className="shrink-0" aria-hidden="true" />
          ) : (
            <AlertCircle size={16} className="shrink-0" aria-hidden="true" />
          )}
          <span>
            {allBalanced
              ? t('bookBalance.allBalanced')
              : enteredCount === 0
                ? `Enter balances for ${totalAccounts} account${totalAccounts !== 1 ? 's' : ''} below`
                : `${enteredCount} of ${totalAccounts} entered · ${balancedCount} balanced`}
          </span>
          {allBalanced && !isMonthLocked && (
            <span className="ml-auto flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-bold">
              <ArrowRight size={12} aria-hidden="true" />
              {t('bookBalance.lockHint')}
            </span>
          )}
        </div>
      )}

      {/* ══ OVERVIEW PANEL ══ */}
      {totalAccounts > 0 && (
        <div
          className={`rounded-2xl border-2 p-5 ${
            totalIsBalanced
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
          }`}
          aria-label="Balance overview"
        >
          <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-4">
            {monthKeyToLabel(selectedMonth)} — {isSeasonView ? 'Running Total' : 'Overview'}
          </p>

          {/* Top-line totals */}
          <div className="grid grid-cols-3 gap-4 text-center mb-4">
            <div>
              <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">
                {t('bookBalance.totalLedger')}
              </p>
              <p className="text-xl font-black text-slate-900 dark:text-white tabular-nums">
                {formatMoney(totals.totalLedger)}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium mt-0.5">calculated by the app</p>
            </div>
            <div className="flex flex-col items-center justify-center gap-1">
              <div className="w-px h-6 bg-slate-200 dark:bg-slate-700" />
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                vs
              </span>
              <div className="w-px h-6 bg-slate-200 dark:bg-slate-700" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">
                {t('bookBalance.totalStated')}
              </p>
              <p
                className={`text-xl font-black tabular-nums ${enteredCount === 0 ? 'text-slate-300 dark:text-slate-600' : 'text-slate-900 dark:text-white'}`}
              >
                {enteredCount === 0 ? '—' : formatMoney(totals.totalStated)}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium mt-0.5">
                {enteredCount === 0 ? 'not yet entered' : 'what you counted'}
              </p>
            </div>
          </div>

          {/* Net delta */}
          {enteredCount > 0 && (
            <div
              className={`pt-4 border-t flex items-center justify-center gap-2 mb-4 ${
                totalIsBalanced
                  ? 'border-emerald-200 dark:border-emerald-800'
                  : 'border-slate-200 dark:border-slate-700'
              }`}
            >
              <span className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                {t('bookBalance.totalDelta')}
              </span>
              <span
                className={`text-xl font-black tabular-nums flex items-center gap-1.5 ${
                  totalIsBalanced ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
                }`}
                aria-live="polite"
              >
                {totalIsBalanced && <CheckCircle2 size={18} aria-hidden="true" />}
                {formatMoney(totals.delta)}
              </span>
            </div>
          )}

          {/* Per-account status rows */}
          <div
            className={`rounded-xl overflow-hidden border ${
              totalIsBalanced ? 'border-emerald-200 dark:border-emerald-800' : 'border-slate-200 dark:border-slate-700'
            }`}
          >
            {/* Bank aggregate row */}
            {hasBankAccounts &&
              (() => {
                const ledger = bankLedgerTotal;
                const stated = bankStoredRow?.statedBalance ?? null;
                const delta = stated !== null ? stated - ledger : null;
                const balanced = delta !== null && Math.abs(delta) < 0.01;
                return (
                  <div className="flex items-center justify-between px-4 py-2.5 bg-white dark:bg-slate-900 gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      {stated !== null ? (
                        balanced ? (
                          <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                        ) : (
                          <AlertCircle size={13} className="text-red-400 shrink-0" />
                        )
                      ) : (
                        <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-200 dark:border-slate-600 shrink-0" />
                      )}
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">
                        Bank Accounts
                      </span>
                    </div>
                    <div className="flex items-center gap-4 shrink-0 text-xs tabular-nums">
                      <span className="text-slate-500 dark:text-slate-400">{formatMoney(ledger)}</span>
                      {delta !== null && (
                        <span
                          className={`font-black ${balanced ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}
                        >
                          {balanced ? '✓' : formatMoney(delta)}
                        </span>
                      )}
                      {!isMonthLocked && !isSeasonView && (
                        <button
                          onClick={() =>
                            setStatementAccount({
                              id: bankAccounts[0]?.id,
                              name: 'Bank Accounts',
                              holding: 'bank',
                              _bankAggregate: true,
                              _allBankIds: bankAccounts.map((a) => a.id),
                            })
                          }
                          className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                          aria-label="Compare bank statement"
                        >
                          <FileSearch size={12} />
                          Compare
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}

            {/* Non-bank account rows */}
            {nonBankAccounts.map((acct, idx) => {
              const ledger = ledgerBalances[acct.id] ?? 0;
              const stored = storedByAccount[acct.id];
              const stated = stored?.statedBalance ?? null;
              const delta = stated !== null ? stated - ledger : null;
              const balanced = delta !== null && Math.abs(delta) < 0.01;
              const showBorder = hasBankAccounts || idx > 0;
              return (
                <div
                  key={acct.id}
                  className={`flex items-center justify-between px-4 py-2.5 bg-white dark:bg-slate-900 gap-3 ${showBorder ? 'border-t border-slate-100 dark:border-slate-800' : ''}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {stated !== null ? (
                      balanced ? (
                        <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                      ) : (
                        <AlertCircle size={13} className="text-red-400 shrink-0" />
                      )
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-200 dark:border-slate-600 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate block">
                        {acct.name}
                      </span>
                      {acct.handle && (
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate block">
                          {acct.handle}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 text-xs tabular-nums">
                    <span className="text-slate-500 dark:text-slate-400">{formatMoney(ledger)}</span>
                    {delta !== null && (
                      <span
                        className={`font-black ${balanced ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}
                      >
                        {balanced ? '✓' : formatMoney(delta)}
                      </span>
                    )}
                    {!isMonthLocked && !isSeasonView && (
                      <button
                        onClick={() => setStatementAccount(acct)}
                        className="flex items-center gap-1 text-[10px] font-bold text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        aria-label={`Compare statement for ${acct.name}`}
                      >
                        <FileSearch size={12} />
                        Compare
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══ EMPTY STATE ══ */}
      {!loading && totalAccounts === 0 && (
        <div className="text-center py-16 px-6 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
          <BookOpen size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" aria-hidden="true" />
          <p className="font-bold text-slate-600 dark:text-slate-300 text-sm mb-1">{t('bookBalance.noAccounts')}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500">{t('bookBalance.noAccountsHint')}</p>
        </div>
      )}

      {/* ══ ACCOUNT CARDS ══ */}
      {totalAccounts > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Bank aggregate card — one card for all bank accounts combined */}
          {hasBankAccounts && (
            <BankAggregateCard
              bankAccounts={bankAccounts}
              bankLedgerTotal={bankLedgerTotal}
              stored={bankStoredRow}
              isMonthLocked={isMonthLocked || isSeasonView}
              onSave={saveBankBalance}
              formatMoney={formatMoney}
              isSaving={isSaving}
            />
          )}

          {/* Individual digital and cash account cards */}
          {nonBankAccounts.map((account) => (
            <AccountBalanceCard
              key={account.id}
              account={account}
              ledgerBalance={ledgerBalances[account.id] ?? 0}
              stored={storedByAccount[account.id] ?? null}
              isMonthLocked={isMonthLocked || isSeasonView}
              onSave={saveBalance}
              formatMoney={formatMoney}
              isSaving={isSaving}
            />
          ))}
        </div>
      )}

      {/* ══ STATEMENT IMPORT MODAL ══ */}
      <StatementImportModal
        show={!!statementAccount}
        onClose={() => setStatementAccount(null)}
        account={statementAccount}
        transactions={transactions}
        monthKey={selectedMonth}
        formatMoney={formatMoney}
      />
    </div>
  );
}
