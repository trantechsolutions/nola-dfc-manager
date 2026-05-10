import React, { useState } from 'react';
import { Lock, CheckCircle2, AlertTriangle, Save, ArrowRight } from 'lucide-react';
import { useT } from '../i18n/I18nContext';
import { HOLDING_COLORS, HOLDING_ICONS, HOLDING_LABELS } from '../utils/holdings';

export default function AccountBalanceCard({
  account,
  ledgerBalance,
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
  const delta = statedNum - ledgerBalance;
  const isBalanced = Math.abs(delta) < 0.01;
  const locked = isMonthLocked;

  const hasDrift = locked && stored?.ledgerBalance != null && Math.abs(stored.ledgerBalance - ledgerBalance) >= 0.01;

  const holdingColors = HOLDING_COLORS[account.holding] || HOLDING_COLORS.none;
  const HoldingIcon = HOLDING_ICONS[account.holding] || HOLDING_ICONS.none;

  async function handleSave() {
    if (!dirty) return;
    await onSave({ accountId: account.id, statedBalance: statedNum, notes });
    setDirty(false);
  }

  return (
    <article
      aria-label={`${account.name} balance card`}
      className={`rounded-2xl border-2 bg-white dark:bg-slate-900 shadow-sm dark:shadow-none flex flex-col transition-all ${
        locked
          ? 'border-slate-200 dark:border-slate-700'
          : isBalanced && hasEntry
            ? 'border-emerald-300 dark:border-emerald-700'
            : 'border-slate-200 dark:border-slate-700'
      }`}
    >
      {/* ── TOP ACCENT BAR ── */}
      <div className={`h-1 rounded-t-2xl ${holdingColors.bg}`} />

      <div className="p-5 flex flex-col gap-4 flex-1">
        {/* ── ACCOUNT HEADER ── */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={`p-2 rounded-xl shrink-0 ${holdingColors.bg}`}>
              <HoldingIcon size={15} className={holdingColors.icon} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="font-black text-slate-900 dark:text-white text-sm leading-tight truncate">{account.name}</p>
              {account.handle && (
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium truncate">{account.handle}</p>
              )}
            </div>
          </div>

          {/* Status badge */}
          {locked ? (
            <span
              className="flex items-center gap-1 shrink-0 text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
              aria-label="Month is locked"
            >
              <Lock size={10} aria-hidden="true" />
              {t('bookBalance.locked')}
            </span>
          ) : (
            <span className="shrink-0 text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-700">
              {HOLDING_LABELS[account.holding]}
            </span>
          )}
        </div>

        {/* ── DRIFT WARNING ── */}
        {hasDrift && (
          <div
            role="alert"
            className="flex items-start gap-2 text-[11px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl px-3 py-2.5"
          >
            <AlertTriangle size={13} className="shrink-0 mt-0.5" aria-hidden="true" />
            <span>{t('bookBalance.driftWarning')}</span>
          </div>
        )}

        {/* ── BALANCE COMPARISON ── */}
        <div className="rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700/60 overflow-hidden">
          {/* Ledger row */}
          <div className="flex items-center justify-between px-4 py-3 gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 leading-tight">
                {t('bookBalance.ledgerBalance')}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-normal leading-tight mt-0.5">
                {t('bookBalance.ledgerBalanceHint')}
              </p>
            </div>
            <span className="text-base font-black text-slate-700 dark:text-slate-200 tabular-nums shrink-0">
              {formatMoney(ledgerBalance)}
            </span>
          </div>

          <div className="h-px bg-slate-200 dark:bg-slate-700 mx-4" />

          {/* Stated balance row */}
          <div className="flex items-center justify-between px-4 py-3 gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 leading-tight">
                {t('bookBalance.statedBalance')}
              </p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 font-normal leading-tight mt-0.5">
                {t('bookBalance.statedBalanceHint')}
              </p>
            </div>
            {locked ? (
              <span className="text-base font-black text-slate-900 dark:text-white tabular-nums shrink-0">
                {formatMoney(stored?.statedBalance ?? 0)}
              </span>
            ) : (
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-sm font-bold text-slate-400 dark:text-slate-500">$</span>
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
                  aria-label={`Stated balance for ${account.name}`}
                  className="w-28 text-right text-base font-black tabular-nums border-2 border-slate-200 dark:border-slate-600 rounded-xl px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-400 dark:bg-slate-800 dark:text-white transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600"
                />
              </div>
            )}
          </div>

          {/* Delta row — always visible once entry exists or locked */}
          {(hasEntry || locked) && (
            <>
              <div className="h-px bg-slate-200 dark:bg-slate-700 mx-4" />
              <div
                className={`flex items-center justify-between px-4 py-3 gap-2 ${
                  isBalanced ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-red-50 dark:bg-red-900/15'
                }`}
              >
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                  {t('bookBalance.delta')}
                </p>
                <span
                  className={`text-sm font-black flex items-center gap-1.5 tabular-nums ${
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
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1.5">
                {t('bookBalance.notes')}
              </span>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  setDirty(true);
                }}
                placeholder={t('bookBalance.notesPlaceholder')}
                aria-label={`Notes for ${account.name}`}
                className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 dark:bg-slate-800 dark:text-white resize-none placeholder:text-slate-300 dark:placeholder:text-slate-600 transition-all"
              />
            </label>

            <button
              onClick={handleSave}
              disabled={!dirty || isSaving}
              aria-label={`Save balance for ${account.name}`}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-black transition-all
                bg-slate-900 dark:bg-white text-white dark:text-slate-900
                hover:bg-slate-700 dark:hover:bg-slate-100
                disabled:opacity-30 disabled:cursor-not-allowed
                focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-700 dark:focus:ring-white"
            >
              <Save size={12} aria-hidden="true" />
              {dirty ? t('bookBalance.unsavedHint') : t('bookBalance.saveBalance')}
            </button>
          </div>
        )}

        {/* ── LOCKED NOTES ── */}
        {locked && stored?.notes && (
          <p className="text-[11px] text-slate-400 dark:text-slate-500 italic leading-relaxed border-t border-slate-100 dark:border-slate-800 pt-3">
            "{stored.notes}"
          </p>
        )}
      </div>
    </article>
  );
}
