import React, { useState } from 'react';
import { Lock, Save, Landmark } from 'lucide-react';
import { useT } from '../i18n/I18nContext';
import AdminCard from './layout/AdminCard';
import { BalanceComparison, DriftWarning } from './AccountBalanceCard';
import { cardVariant } from '../utils/reconcileVariant';

/**
 * BankAggregateCard — the same AdminLTE card as AccountBalanceCard, but for all
 * bank accounts reconciled as one figure (a statement covers the institution,
 * not each sub-account). Shares that file's body pieces so the two cards cannot
 * drift apart visually.
 */
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

  async function handleSave() {
    if (!dirty) return;
    await onSave({ statedBalance: statedNum, notes });
    setDirty(false);
  }

  return (
    <AdminCard
      title={t('bookBalance.bankTotal')}
      subtitle={bankAccounts.map((a) => a.name).join(' · ')}
      icon={Landmark}
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
          <span className="shrink-0 rounded-lg border border-border bg-background px-2 py-1 text-xs font-bold text-muted-foreground">
            Bank
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
            aria-label="Save bank balance"
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
        ledgerHint={t('bookBalance.bankLedgerHint')}
        ledgerValue={formatMoney(bankLedgerTotal)}
        statedLabel={t('bookBalance.statedBalance')}
        statedHint={t('bookBalance.bankStatedHint')}
        locked={locked}
        lockedStatedValue={formatMoney(stored?.statedBalance ?? 0)}
        statedInput={statedInput}
        onStatedChange={(v) => {
          setStatedInput(v);
          setDirty(true);
        }}
        inputAriaLabel="Stated balance for all bank accounts combined"
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
            aria-label="Notes for bank total"
            className="w-full resize-none rounded-lg border border-border bg-card px-3 py-2 text-xs outline-none transition-all placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
          />
        </label>
      )}
    </AdminCard>
  );
}
