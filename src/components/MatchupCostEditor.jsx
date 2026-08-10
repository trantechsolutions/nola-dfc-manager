// What a game is expected to cost, entered on the planner row while the
// schedule is still being negotiated.
//
// Deliberately not an expense form: nothing here touches the ledger or a
// player's balance. These are forecast lines the manager can shape in July and
// roll into the season budget (see utils/plannedCostBudget) long before the
// first real receipt exists — at which point the event expense flow takes over
// and supersedes the estimate.

import { useState } from 'react';
import { Plus, Trash2, BookOpen, Clock, CheckCircle2 } from 'lucide-react';
import { EXPENSE_CATEGORIES, getCategoryLabels } from '../utils/expenseCategories';
import { useT } from '../i18n/I18nContext';

/** Quick-adds for the costs that show up on nearly every fixture. */
const TEMPLATES = [
  { key: 'referee', category: 'LEA' },
  { key: 'field', category: 'OPE' },
  { key: 'coach', category: 'OPE' },
  { key: 'travel', category: 'OPE' },
];

const money = (n) => `$${(Math.round((Number(n) || 0) * 100) / 100).toFixed(2)}`;

/**
 * Where an estimate stands with the ledger. `budgeted` gates the action because
 * a cost the budget has never seen has no fee behind it — filing it would put
 * spend on the books the season was never sized for.
 */
function LedgerState({ cost, budgeted, tx, onSend, busy, t }) {
  if (cost.ledgerTxId) {
    const cleared = tx?.cleared === true || String(tx?.cleared).toLowerCase() === 'true';
    return cleared ? (
      <span
        className="flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400"
        title={t('planCosts.clearedInLedgerHint')}
      >
        <CheckCircle2 size={12} /> {t('planCosts.clearedInLedger')}
      </span>
    ) : (
      <span
        className="flex items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-400"
        title={t('planCosts.pendingInLedgerHint')}
      >
        <Clock size={12} /> {t('planCosts.pendingInLedger')}
      </span>
    );
  }

  if (!onSend) return null;

  return (
    <button
      type="button"
      onClick={onSend}
      disabled={busy || !budgeted}
      title={budgeted ? t('planCosts.toLedgerHint') : t('planCosts.needsBudgetFirst')}
      className="flex items-center gap-1 px-2 py-1 rounded border border-border bg-card text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-ring transition-colors disabled:opacity-40 disabled:cursor-default"
    >
      <BookOpen size={12} /> {t('planCosts.toLedger')}
    </button>
  );
}

export default function MatchupCostEditor({
  costs = [],
  canEdit = false,
  onAdd,
  onUpdate,
  onDelete,
  // Ledger hand-off. Absent when the viewer cannot touch the ledger.
  onSendToLedger = null,
  isBudgeted = () => false,
  ledgerTxById = {},
}) {
  const { t } = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const labels = getCategoryLabels(t);

  const total = costs.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

  // Every write here is a single row against a tiny table, so the row list is
  // the source of truth and a failure just surfaces inline rather than trying
  // to reconcile optimistic state.
  const run = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e?.message || t('planCosts.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const commit = (cost, field, raw) => {
    const value = field === 'amount' ? parseFloat(raw) || 0 : raw;
    if (cost[field] === value) return;
    run(() => onUpdate(cost.id, { [field]: value }));
  };

  return (
    <div className="w-full mt-1 rounded-lg border border-dashed border-border bg-background/60 p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t('planCosts.title')}</p>
        <p className="text-xs font-bold text-foreground">{money(total)}</p>
      </div>

      {costs.length === 0 && <p className="text-xs italic text-muted-foreground">{t('planCosts.empty')}</p>}

      {costs.map((cost) => {
        // Once an estimate has been filed in the ledger the ledger row is the
        // truth. Editing the estimate underneath it would leave two different
        // numbers for the same cost with nothing to reconcile them, and
        // deleting it would strand a pending expense with nothing behind it.
        const inLedger = !!cost.ledgerTxId;
        const frozen = !canEdit || busy || inLedger;
        return (
          <div key={cost.id} className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              defaultValue={cost.label || ''}
              disabled={frozen}
              title={inLedger ? t('planCosts.frozenByLedger') : undefined}
              placeholder={t('planCosts.labelPlaceholder')}
              onBlur={(e) => commit(cost, 'label', e.target.value)}
              className="min-w-[8rem] flex-1 px-2 py-1 text-xs bg-card border border-border rounded outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
            />
            <select
              value={cost.category}
              disabled={frozen}
              title={inLedger ? t('planCosts.frozenByLedger') : undefined}
              onChange={(e) => commit(cost, 'category', e.target.value)}
              className="px-2 py-1 text-xs font-semibold bg-card border border-border rounded outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
            >
              {(EXPENSE_CATEGORIES.includes(cost.category)
                ? EXPENSE_CATEGORIES
                : [...EXPENSE_CATEGORIES, cost.category]
              ).map((code) => (
                <option key={code} value={code}>
                  {labels[code] || code}
                </option>
              ))}
            </select>
            <div className="relative">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                defaultValue={Number(cost.amount) || 0}
                disabled={frozen}
                title={inLedger ? t('planCosts.frozenByLedger') : undefined}
                onBlur={(e) => commit(cost, 'amount', e.target.value)}
                className="w-24 pl-5 pr-2 py-1 text-xs bg-card border border-border rounded outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
              />
            </div>
            <LedgerState
              cost={cost}
              budgeted={isBudgeted(cost)}
              tx={cost.ledgerTxId ? ledgerTxById[cost.ledgerTxId] : null}
              onSend={
                onSendToLedger
                  ? () =>
                      run(async () => {
                        const result = await onSendToLedger(cost);
                        if (result && result.success === false) throw new Error(result.error);
                      })
                  : null
              }
              busy={busy}
              t={t}
            />
            {canEdit && (
              <button
                type="button"
                onClick={() => run(() => onDelete(cost.id))}
                disabled={busy || inLedger}
                title={inLedger ? t('planCosts.frozenByLedger') : t('common.delete')}
                className="p-1 rounded hover:bg-rose-50 dark:hover:bg-rose-900/30 text-rose-600 dark:text-rose-400 disabled:opacity-50"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        );
      })}

      {canEdit && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {TEMPLATES.map((tmpl) => (
            <button
              key={tmpl.key}
              type="button"
              disabled={busy}
              onClick={() => run(() => onAdd({ category: tmpl.category, label: t(`planCosts.tmpl.${tmpl.key}`) }))}
              className="px-2 py-1 rounded-full border border-border bg-card text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-ring transition-colors disabled:opacity-50"
            >
              + {t(`planCosts.tmpl.${tmpl.key}`)}
            </button>
          ))}
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => onAdd({ category: 'OPE', label: '' }))}
            className="flex items-center gap-1 px-2 py-1 rounded-full bg-blue-500 hover:bg-blue-600 text-white text-xs font-semibold transition-colors disabled:opacity-50"
          >
            <Plus size={12} /> {t('planCosts.addCost')}
          </button>
        </div>
      )}

      {error && <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}
