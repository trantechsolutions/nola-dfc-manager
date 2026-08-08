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
  Calculator,
  Wallet,
  Scale,
} from 'lucide-react';
import AccountBalanceCard from '../../components/AccountBalanceCard';
import BankAggregateCard from '../../components/BankAggregateCard';
import StatementImportModal from '../../components/StatementImportModal';
import AdminCard from '../../components/layout/AdminCard';
import InfoBox from '../../components/layout/InfoBox';
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

  // showConfirm resolves to the user's answer and takes no callback — passing
  // one silently dropped it, so Proceed did nothing and the month never locked.
  async function handleLockClick() {
    const ok = await showConfirm(t('bookBalance.lockMonthConfirm', { month: monthKeyToLabel(selectedMonth) }));
    if (ok) await lockMonth();
  }

  async function handleUnlockClick() {
    const ok = await showConfirm(t('bookBalance.unlockMonthConfirm', { month: monthKeyToLabel(selectedMonth) }));
    if (ok) await unlockMonth();
  }

  return (
    <div className="space-y-5">
      {/* ══ HEADER ══ */}
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {isMonthLocked && (
              <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg bg-muted text-foreground">
                <Lock size={10} aria-hidden="true" />
                {t('bookBalance.lockedBadge')}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground font-medium mt-1">{t('bookBalance.subtitle')}</p>
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {/* How it works toggle */}
          <button
            onClick={() => setShowInstructions((p) => !p)}
            aria-expanded={showInstructions}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-border bg-card text-muted-foreground hover:bg-background transition-all"
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
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-border bg-card text-foreground hover:bg-background transition-all"
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
                className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-lg shadow-md overflow-hidden min-w-[176px] max-h-64 overflow-y-auto"
              >
                {monthOptions.map((key) => (
                  <li key={key} role="option" aria-selected={key === selectedMonth}>
                    <button
                      onClick={() => {
                        setSelectedMonth(key);
                        setShowMonthPicker(false);
                      }}
                      className={`w-full text-left px-4 py-2.5 text-xs font-semibold hover:bg-background transition-colors ${
                        key === selectedMonth ? 'bg-primary/10 text-primary' : 'text-foreground'
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
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-warning/40 bg-warning/10 text-amber-700 transition-all hover:bg-warning/20 focus:outline-none focus:ring-2 focus:ring-warning disabled:opacity-40 dark:text-amber-400"
                >
                  <Unlock size={13} aria-hidden="true" />
                  {t('bookBalance.unlockMonth')}
                </button>
              )
            ) : (
              <button
                onClick={handleLockClick}
                disabled={isSaving || totalAccounts === 0}
                className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground transition-all hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Lock size={13} aria-hidden="true" />
                {t('bookBalance.lockMonth')}
              </button>
            ))}
        </div>
      </div>

      {/* ══ HOW IT WORKS ══ AdminLTE card with the `remove` tool, so the X in
          the header dismisses it the same way the toolbar button does. */}
      {showInstructions && (
        <AdminCard
          title={t('bookBalance.howItWorks')}
          icon={Info}
          variant="accent"
          className="mb-0"
          onRemove={() => setShowInstructions(false)}
        >
          <ol className="space-y-2.5" aria-label="Steps">
            {[t('bookBalance.step1'), t('bookBalance.step2'), t('bookBalance.step3')].map((step, i) => (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                  {i + 1}
                </span>
                <p className="text-sm font-medium leading-snug text-foreground">{step}</p>
              </li>
            ))}
          </ol>
        </AdminCard>
      )}

      {/* ══ STATUS BAR ══
          Surfaces and borders use the semantic tokens so they track the theme.
          The success/warning TEXT stays on the emerald/amber ramp: dark mode
          does not re-light --success/--warning (see index.css), so `text-success`
          would drop to ~3:1 on the dark background. `text-destructive` is kept
          as a token because #dc3545 clears AA on both surfaces. */}
      {totalAccounts > 0 && !isMonthLocked && !isSeasonView && (
        <div
          className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-sm font-medium transition-all ${
            allBalanced
              ? 'border-success/40 bg-success/10 text-emerald-700 dark:text-emerald-400'
              : enteredCount > 0
                ? 'border-warning/40 bg-warning/10 text-amber-700 dark:text-amber-400'
                : 'bg-background border-border text-muted-foreground'
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
            <span className="ml-auto flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
              <ArrowRight size={12} aria-hidden="true" />
              {t('bookBalance.lockHint')}
            </span>
          )}
        </div>
      )}

      {/* ══ OVERVIEW ══ AdminLTE card carrying three `.info-box` stat tiles
          over the per-account reconciliation list. */}
      {totalAccounts > 0 && (
        <AdminCard
          title={`${monthKeyToLabel(selectedMonth)} — ${isSeasonView ? 'Running Total' : 'Overview'}`}
          icon={Scale}
          variant={totalIsBalanced ? 'success' : 'none'}
          className="mb-0"
          bodyClassName="space-y-4"
        >
          {/* Top-line totals */}
          <div className="grid gap-4 sm:grid-cols-3">
            <InfoBox
              className="mb-0"
              icon={Calculator}
              tone="muted"
              label={t('bookBalance.totalLedger')}
              value={formatMoney(totals.totalLedger)}
            />
            <InfoBox
              className="mb-0"
              icon={Wallet}
              tone="muted"
              label={t('bookBalance.totalStated')}
              value={enteredCount === 0 ? '—' : formatMoney(totals.totalStated)}
            />
            <InfoBox
              className="mb-0"
              icon={totalIsBalanced ? CheckCircle2 : Scale}
              tone={enteredCount === 0 ? 'muted' : totalIsBalanced ? 'success' : 'destructive'}
              label={t('bookBalance.totalDelta')}
              value={enteredCount === 0 ? '—' : formatMoney(totals.delta)}
            />
          </div>

          {/* Per-account status rows */}
          <div
            className={`overflow-hidden rounded-lg border ${totalIsBalanced ? 'border-success/40' : 'border-border'}`}
          >
            {/* Bank aggregate row */}
            {hasBankAccounts &&
              (() => {
                const ledger = bankLedgerTotal;
                const stated = bankStoredRow?.statedBalance ?? null;
                const delta = stated !== null ? stated - ledger : null;
                const balanced = delta !== null && Math.abs(delta) < 0.01;
                return (
                  <div className="flex items-center justify-between px-4 py-2.5 bg-card gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      {stated !== null ? (
                        balanced ? (
                          <CheckCircle2 size={13} className="text-emerald-700 dark:text-emerald-400 shrink-0" />
                        ) : (
                          <AlertCircle size={13} className="shrink-0 text-destructive" />
                        )
                      ) : (
                        <div className="w-3.5 h-3.5 rounded-full border-2 border-border shrink-0" />
                      )}
                      <span className="text-xs font-medium text-foreground truncate">Bank Accounts</span>
                    </div>
                    <div className="flex items-center gap-4 shrink-0 text-xs tabular-nums">
                      <span className="text-muted-foreground">{formatMoney(ledger)}</span>
                      {delta !== null && (
                        <span
                          className={`font-bold ${balanced ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}
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
                          className="flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-primary"
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
                  className={`flex items-center justify-between px-4 py-2.5 bg-card gap-3 ${showBorder ? 'border-t border-border' : ''}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {stated !== null ? (
                      balanced ? (
                        <CheckCircle2 size={13} className="text-emerald-700 dark:text-emerald-400 shrink-0" />
                      ) : (
                        <AlertCircle size={13} className="shrink-0 text-destructive" />
                      )
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-border shrink-0" />
                    )}
                    <div className="min-w-0">
                      <span className="text-xs font-medium text-foreground truncate block">{acct.name}</span>
                      {acct.handle && (
                        <span className="text-xs text-muted-foreground truncate block">{acct.handle}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 text-xs tabular-nums">
                    <span className="text-muted-foreground">{formatMoney(ledger)}</span>
                    {delta !== null && (
                      <span
                        className={`font-bold ${balanced ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}
                      >
                        {balanced ? '✓' : formatMoney(delta)}
                      </span>
                    )}
                    {!isMonthLocked && !isSeasonView && (
                      <button
                        onClick={() => setStatementAccount(acct)}
                        className="flex items-center gap-1 text-xs font-semibold text-muted-foreground transition-colors hover:text-primary"
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
        </AdminCard>
      )}

      {/* ══ EMPTY STATE ══ */}
      {!loading && totalAccounts === 0 && (
        <AdminCard title={t('bookBalance.noAccounts')} icon={BookOpen} className="mb-0">
          <div className="px-6 py-10 text-center">
            <BookOpen size={32} className="mx-auto mb-3 text-muted-foreground" aria-hidden="true" />
            <p className="text-xs text-muted-foreground">{t('bookBalance.noAccountsHint')}</p>
          </div>
        </AdminCard>
      )}

      {/* ══ ACCOUNT CARDS ══ Column count climbs with the viewport — the page is
          uncapped, so two columns would stretch each card to half a wide monitor. */}
      {totalAccounts > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
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
