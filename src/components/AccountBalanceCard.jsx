import React, { useState } from 'react';
import { Lock, CheckCircle2, AlertTriangle, Save } from 'lucide-react';
import { useT } from '../i18n/I18nContext';
import AdminCard from './layout/AdminCard';
import { HOLDING_COLORS, HOLDING_ICONS, HOLDING_LABELS } from '../utils/holdings';
import { cardVariant } from '../utils/reconcileVariant';

/**
 * AccountBalanceCard — AdminLTE `.card.card-outline`: the reconciliation state
 * drives the top accent rule, the holding chip rides in `card-tools`, and the
 * commit sits alone in the `card-footer`. Same box as the settings panes, so a
 * balance card and a settings card read as the same object.
 */
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
    <AdminCard
      title={account.name}
      subtitle={account.handle}
      icon={HoldingIcon}
      variant={cardVariant({ locked, hasEntry, isBalanced })}
      className="mb-0"
      bodyClassName="space-y-4"
      tools={
        locked ? (
          <span
            className="flex shrink-0 items-center gap-1 rounded-lg bg-muted px-2 py-1 text-xs font-bold text-muted-foreground"
            aria-label="Month is locked"
          >
            <Lock size={10} aria-hidden="true" />
            {t('bookBalance.locked')}
          </span>
        ) : (
          <span
            className={`shrink-0 rounded-lg border px-2 py-1 text-xs font-bold ${holdingColors.bg} ${holdingColors.text} ${holdingColors.border}`}
          >
            {HOLDING_LABELS[account.holding]}
          </span>
        )
      }
      footer={
        locked ? (
          stored?.notes ? (
            <p className="text-xs italic leading-relaxed text-muted-foreground">"{stored.notes}"</p>
          ) : null
        ) : (
          <button
            onClick={handleSave}
            disabled={!dirty || isSaving}
            aria-label={`Save balance for ${account.name}`}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-primary py-2.5 text-xs font-bold text-primary-foreground transition-all hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-30"
          >
            <Save size={12} aria-hidden="true" />
            {dirty ? t('bookBalance.unsavedHint') : t('bookBalance.saveBalance')}
          </button>
        )
      }
    >
      {hasDrift && <DriftWarning text={t('bookBalance.driftWarning')} />}

      <BalanceComparison
        ledgerLabel={t('bookBalance.ledgerBalance')}
        ledgerHint={t('bookBalance.ledgerBalanceHint')}
        ledgerValue={formatMoney(ledgerBalance)}
        statedLabel={t('bookBalance.statedBalance')}
        statedHint={t('bookBalance.statedBalanceHint')}
        locked={locked}
        lockedStatedValue={formatMoney(stored?.statedBalance ?? 0)}
        statedInput={statedInput}
        onStatedChange={(v) => {
          setStatedInput(v);
          setDirty(true);
        }}
        inputAriaLabel={`Stated balance for ${account.name}`}
        placeholder={t('bookBalance.enterBalance')}
        showDelta={hasEntry || locked}
        isBalanced={isBalanced}
        deltaLabel={t('bookBalance.delta')}
        balancedText={t('bookBalance.balanced')}
        offByText={t('bookBalance.offBy', { amount: formatMoney(Math.abs(delta)) })}
      />

      {!locked && (
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-muted-foreground">{t('bookBalance.notes')}</span>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              setDirty(true);
            }}
            placeholder={t('bookBalance.notesPlaceholder')}
            aria-label={`Notes for ${account.name}`}
            className="w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-xs outline-none transition-all placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
          />
        </label>
      )}
    </AdminCard>
  );
}

export function DriftWarning({ text }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5 text-xs font-medium text-foreground"
    >
      <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}

/** The ledger / stated / delta stack, shared by both balance cards. */
export function BalanceComparison({
  ledgerLabel,
  ledgerHint,
  ledgerValue,
  statedLabel,
  statedHint,
  locked,
  lockedStatedValue,
  statedInput,
  onStatedChange,
  inputAriaLabel,
  placeholder,
  showDelta,
  isBalanced,
  deltaLabel,
  balancedText,
  offByText,
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-medium leading-tight text-foreground">{ledgerLabel}</p>
          <p className="mt-0.5 text-xs font-normal leading-tight text-muted-foreground">{ledgerHint}</p>
        </div>
        <span className="shrink-0 text-base font-bold tabular-nums text-foreground">{ledgerValue}</span>
      </div>

      <div className="mx-4 h-px bg-muted" />

      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <div className="min-w-0">
          <p className="text-xs font-medium leading-tight text-foreground">{statedLabel}</p>
          <p className="mt-0.5 text-xs font-normal leading-tight text-muted-foreground">{statedHint}</p>
        </div>
        {locked ? (
          <span className="shrink-0 text-base font-bold tabular-nums text-foreground">{lockedStatedValue}</span>
        ) : (
          <div className="flex shrink-0 items-center gap-1">
            <span className="text-sm font-semibold text-muted-foreground">$</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={statedInput}
              onChange={(e) => onStatedChange(e.target.value)}
              placeholder={placeholder}
              aria-label={inputAriaLabel}
              className="w-28 rounded-lg border-2 border-border px-3 py-1.5 text-right text-base font-bold tabular-nums outline-none transition-all placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring"
            />
          </div>
        )}
      </div>

      {showDelta && (
        <>
          <div className="mx-4 h-px bg-muted" />
          <div
            className={`flex items-center justify-between gap-2 px-4 py-3 ${
              isBalanced ? 'bg-success/10' : 'bg-destructive/10'
            }`}
          >
            <p className="text-xs font-bold text-muted-foreground">{deltaLabel}</p>
            <span
              className={`flex items-center gap-1.5 text-sm font-bold tabular-nums ${
                isBalanced ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive'
              }`}
              aria-live="polite"
            >
              {isBalanced ? (
                <>
                  <CheckCircle2 size={14} aria-hidden="true" />
                  {balancedText}
                </>
              ) : (
                <>
                  <AlertTriangle size={13} aria-hidden="true" />
                  {offByText}
                </>
              )}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
