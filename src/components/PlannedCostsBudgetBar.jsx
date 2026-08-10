// The bridge between the planner's forecast and the season budget.
//
// Shown on both screens that care: the planner, where the estimates are typed,
// and the budget, where they become lines the treasurer saves. Same numbers,
// same button, so the two can never tell the manager different things about
// what is already budgeted.
//
// A finalized budget is never edited in one tap — the push is recorded as an
// amendment, and an amendment can re-price every family, so it takes a second
// deliberate confirmation and offers a reason for the record.

import { useState } from 'react';
import { PiggyBank, Lock, AlertTriangle } from 'lucide-react';
import { useT } from '../i18n/I18nContext';

const money = (n) => `$${(Math.round((Number(n) || 0) * 100) / 100).toFixed(2)}`;

export default function PlannedCostsBudgetBar({
  summary,
  locked = false,
  recalculatesFee = true,
  available = true,
  onPush = null,
  className = '',
}) {
  const { t } = useT();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [pushing, setPushing] = useState(false);
  const [error, setError] = useState('');

  const {
    plannedTotal = 0,
    appliedTotal = 0,
    delta = 0,
    fall = 0,
    spring = 0,
    supersededTotal = 0,
    matchupCount = 0,
  } = summary || {};

  const canPush = !!onPush && available && delta !== 0;

  const handlePush = async () => {
    if (!canPush) return;
    if (locked && !confirming) {
      setConfirming(true);
      return;
    }
    setPushing(true);
    setError('');
    try {
      const result = await onPush({ reason: reason.trim() });
      if (result && result.success === false) {
        setError(result.error || t('planCosts.failed'));
        return;
      }
      setConfirming(false);
      setReason('');
    } catch (e) {
      setError(e?.message || t('planCosts.failed'));
    } finally {
      setPushing(false);
    }
  };

  return (
    <div className={`bg-card rounded-lg border border-border shadow-sm p-3 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
            <PiggyBank size={13} /> {t('planCosts.budgetTitle')}
            {locked && (
              <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400">
                <Lock size={11} /> {t('planCosts.locked')}
              </span>
            )}
          </p>
          <p className="mt-0.5 text-sm font-bold text-foreground">
            {t('planCosts.forecast', { amount: money(plannedTotal), n: matchupCount })}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('planCosts.halves', { fall: money(fall), spring: money(spring) })}
            {' · '}
            {t('planCosts.inBudget', { amount: money(appliedTotal) })}
          </p>
          {!available ? (
            <p className="mt-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">{t('planCosts.noBudget')}</p>
          ) : delta === 0 ? (
            <p className="mt-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              {t('planCosts.upToDate')}
            </p>
          ) : (
            <p
              className={`mt-0.5 text-xs font-semibold ${delta > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-blue-700 dark:text-blue-400'}`}
            >
              {delta > 0
                ? t('planCosts.pendingAdd', { amount: money(delta) })
                : t('planCosts.pendingRemove', { amount: money(Math.abs(delta)) })}
            </p>
          )}
          {supersededTotal > 0 && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t('planCosts.superseded', { amount: money(supersededTotal) })}
            </p>
          )}
        </div>

        {onPush && (
          <button
            type="button"
            onClick={handlePush}
            disabled={!canPush || pushing}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-default flex items-center gap-1 ${
              locked ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            <PiggyBank size={12} />
            {pushing
              ? t('common.saving')
              : confirming
                ? t('planCosts.confirmAmend')
                : appliedTotal !== 0
                  ? t('planCosts.update')
                  : t('planCosts.add')}
          </button>
        )}
      </div>

      {confirming && (
        <div className="mt-2 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/30 p-2.5 space-y-2">
          <p className="flex items-start gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            <span>
              {t('planCosts.lockedMsg')} {recalculatesFee ? t('planCosts.lockedFees') : t('planCosts.lockedFeesOff')}
            </span>
          </p>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('planCosts.reasonPlaceholder')}
            className="w-full px-2 py-1.5 text-xs bg-card border border-amber-200 dark:border-amber-700 rounded outline-none focus:ring-1 focus:ring-amber-400"
          />
          <button
            type="button"
            onClick={() => {
              setConfirming(false);
              setReason('');
            }}
            className="text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            {t('common.cancel')}
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
