import React, { useState } from 'react';
import { Lock, CheckCircle2, AlertTriangle, Save, Landmark } from 'lucide-react';
import { useT } from '../i18n/I18nContext';
import { HOLDING_COLORS } from '../utils/holdings';

export default function BankAggregateCard({
  bankAccounts,
  bankLedgerTotal,
  stored,
  isMonthLocked,
  onSave,
  formatMoney,
  isSaving,
}) {
  const { t } = useT();

  const storedId = stored?.id ?? null;
  const [editKey, setEditKey] = useState(storedId);
  const [statedInput, setStatedInput] = useState(stored ? stored.statedBalance.toFixed(2) : '');
  const [notes, setNotes] = useState(stored?.notes || '');
  const [dirty, setDirty] = useState(false);

  if (storedId !== editKey) {
    setEditKey(storedId);
    setStatedInput(stored ? stored.statedBalance.toFixed(2) : '');
    setNotes(stored?.notes || '');
    setDirty(false);
  }

  const statedNum = parseFloat(statedInput) || 0;
  const hasEntry = statedInput !== '';
  const delta = statedNum - bankLedgerTotal;
  const isBalanced = Math.abs(delta) < 0.01;
  const locked = isMonthLocked;

  const hasDrift = locked && stored?.ledgerBalance != null && Math.abs(stored.ledgerBalance - bankLedgerTotal) >= 0.01;

  const colors = HOLDING_COLORS.bank;

  async function handleSave() {
    if (!dirty) return;
    await onSave({ statedBalance: statedNum, notes });
    setDirty(false);
  }

  return (
    <article
      aria-label="Bank accounts aggregate balance card"
      className={`rounded-lg border-2 bg-card shadow-sm flex flex-col transition-all ${
        locked
          ? 'border-border'
          : isBalanced && hasEntry
            ? 'border-emerald-300 dark:border-emerald-700'
            : 'border-border'
      }`}
    >
      {/* ── TOP ACCENT BAR ── */}
      <div className={`h-1 rounded-t-2xl ${colors.bg}`} />

      <div className="p-5 flex flex-col gap-4 flex-1">
        {/* ── ACCOUNT HEADER ── */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`p-2 rounded-lg shrink-0 ${colors.bg}`}>
              <Landmark size={15} className={colors.icon} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-foreground text-sm leading-tight">{t('bookBalance.bankTotal')}</p>
              <p className="text-xs text-muted-foreground font-medium leading-relaxed">
                {bankAccounts.map((a) => a.name).join(' · ')}
              </p>
            </div>
          </div>

          {/* Status badge */}
          {locked ? (
            <span
              className="flex items-center gap-1 shrink-0 text-xs font-bold px-2 py-1 rounded-lg bg-muted text-muted-foreground"
              aria-label="Month is locked"
            >
              <Lock size={10} aria-hidden="true" />
              {t('bookBalance.locked')}
            </span>
          ) : (
            <span className="shrink-0 text-xs font-bold px-2 py-1 rounded-lg bg-background text-muted-foreground border border-border">
              Bank
            </span>
          )}
        </div>

        {/* ── DRIFT WARNING ── */}
        {hasDrift && (
          <div
            role="alert"
            className="flex items-start gap-2 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg px-3 py-2.5"
          >
            <AlertTriangle size={13} className="shrink-0 mt-0.5" aria-hidden="true" />
            <span>{t('bookBalance.driftWarning')}</span>
          </div>
        )}

        {/* ── BALANCE COMPARISON ── */}
        <div className="rounded-lg bg-background border border-border overflow-hidden">
          {/* Ledger row */}
          <div className="flex items-center justify-between px-4 py-3 gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground leading-tight">{t('bookBalance.ledgerBalance')}</p>
              <p className="text-xs text-muted-foreground font-normal leading-tight mt-0.5">
                {t('bookBalance.bankLedgerHint')}
              </p>
            </div>
            <span className="text-base font-bold text-foreground tabular-nums shrink-0">
              {formatMoney(bankLedgerTotal)}
            </span>
          </div>

          <div className="h-px bg-muted mx-4" />

          {/* Stated balance row */}
          <div className="flex items-center justify-between px-4 py-3 gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground leading-tight">{t('bookBalance.statedBalance')}</p>
              <p className="text-xs text-muted-foreground font-normal leading-tight mt-0.5">
                {t('bookBalance.bankStatedHint')}
              </p>
            </div>
            {locked ? (
              <span className="text-base font-bold text-foreground tabular-nums shrink-0">
                {formatMoney(stored?.statedBalance ?? 0)}
              </span>
            ) : (
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-sm font-semibold text-muted-foreground">$</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={statedInput}
                  onChange={(e) => {
                    setStatedInput(e.target.value);
                    setDirty(true);
                  }}
                  placeholder={t('bookBalance.enterBalance')}
                  aria-label="Stated balance for all bank accounts combined"
                  className="w-28 text-right text-base font-bold tabular-nums border-2 border-border rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-ring focus:border-ring transition-all placeholder:text-muted-foreground"
                />
              </div>
            )}
          </div>

          {/* Delta row */}
          {(hasEntry || locked) && (
            <>
              <div className="h-px bg-muted mx-4" />
              <div
                className={`flex items-center justify-between px-4 py-3 gap-2 ${
                  isBalanced ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-red-50 dark:bg-red-900/15'
                }`}
              >
                <p className="text-xs font-bold text-muted-foreground">{t('bookBalance.delta')}</p>
                <span
                  className={`text-sm font-bold flex items-center gap-1.5 tabular-nums ${
                    isBalanced ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-600 dark:text-red-400'
                  }`}
                  aria-live="polite"
                >
                  {isBalanced ? (
                    <>
                      <CheckCircle2 size={14} aria-hidden="true" />
                      {t('bookBalance.balanced')}
                    </>
                  ) : (
                    <>
                      <AlertTriangle size={13} aria-hidden="true" />
                      {t('bookBalance.offBy', { amount: formatMoney(Math.abs(delta)) })}
                    </>
                  )}
                </span>
              </div>
            </>
          )}
        </div>

        {/* ── NOTES + SAVE (unlocked only) ── */}
        {!locked && (
          <div className="space-y-2 mt-auto">
            <label className="block">
              <span className="text-xs font-bold text-muted-foreground block mb-1.5">{t('bookBalance.notes')}</span>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  setDirty(true);
                }}
                placeholder={t('bookBalance.notesPlaceholder')}
                aria-label="Notes for bank total"
                className="w-full text-xs border border-border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-ring resize-none placeholder:text-muted-foreground transition-all"
              />
            </label>

            <button
              onClick={handleSave}
              disabled={!dirty || isSaving}
              aria-label="Save bank balance"
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold transition-all
                bg-card text-white
                hover:bg-accent/90
                disabled:opacity-30 disabled:cursor-not-allowed
                focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring dark:focus:ring-white"
            >
              <Save size={12} aria-hidden="true" />
              {dirty ? t('bookBalance.unsavedHint') : t('bookBalance.saveBalance')}
            </button>
          </div>
        )}

        {/* ── LOCKED NOTES ── */}
        {locked && stored?.notes && (
          <p className="text-xs text-muted-foreground italic leading-relaxed border-t border-border pt-3">
            "{stored.notes}"
          </p>
        )}
      </div>
    </article>
  );
}
