import { useState } from 'react';
import { X, Plus, CheckCircle2, Clock, DollarSign, Trash2, Receipt } from 'lucide-react';
import { EVENT_TYPES } from '../utils/eventClassifier';
import { useT } from '../i18n/I18nContext';
import { getSeasonForDate } from '../utils/seasonUtils';

const CATEGORY_COLORS = {
  TOU: 'bg-amber-50 text-amber-700 dark:text-amber-300',
  LEA: 'bg-orange-50 text-orange-700',
  OPE: 'bg-muted text-foreground',
  FRI: 'bg-rose-50 text-rose-700',
};

import { HOLDINGS, HOLDING_LABELS } from '../utils/holdings';

function getExpenseTemplates(t) {
  return {
    league: [
      { title: t('expenses.refereeFees'), category: 'LEA' },
      { title: t('expenses.leagueFees'), category: 'LEA' },
      { title: t('expenses.coachFees'), category: 'OPE' },
    ],
    tournament: [
      { title: t('expenses.tournamentReg'), category: 'TOU' },
      { title: t('expenses.checkInFees'), category: 'TOU' },
      { title: t('expenses.coachFees'), category: 'OPE' },
    ],
    friendly: [
      { title: t('expenses.refereeFees'), category: 'OPE' },
      { title: t('expenses.coachFees'), category: 'OPE' },
    ],
    practice: [
      { title: t('expenses.fieldRental'), category: 'OPE' },
      { title: t('expenses.coachFees'), category: 'OPE' },
    ],
    event: [
      { title: t('expenses.eventFees'), category: 'OPE' },
      { title: t('expenses.coachFees'), category: 'OPE' },
    ],
  };
}

function getCategoryLabels(t) {
  return {
    TOU: t('categories.tournament'),
    LEA: t('categories.leagueRefs'),
    OPE: t('categories.operating'),
    FRI: t('categories.friendlies'),
    TMF: t('categories.teamFees'),
    FUN: t('categories.fundraising'),
    SPO: t('categories.sponsorship'),
    CRE: t('categories.credit'),
  };
}

export default function EventExpenseModal({
  show,
  onClose,
  dbEvent,
  linkedTransactions = [],
  onSaveExpense,
  onToggleCleared,
  onDeleteExpense,
  seasonIds = [],
  activeAccounts = [],
  accountMap = {},
}) {
  const { t } = useT();
  const [adding, setAdding] = useState(false);
  const defaultAccountId = activeAccounts[0]?.id || '';
  const [form, setForm] = useState({ title: '', amount: '', category: 'OPE', accountId: defaultAccountId });
  const [saving, setSaving] = useState(false);

  const accountsByHolding = HOLDINGS.reduce((acc, h) => {
    acc[h] = activeAccounts.filter((a) => a.holding === h);
    return acc;
  }, {});

  if (!show || !dbEvent) return null;

  const CATEGORY_LABELS = getCategoryLabels(t);
  const EXPENSE_TEMPLATES = getExpenseTemplates(t);

  const eventType = EVENT_TYPES[dbEvent.eventType] || EVENT_TYPES.event;
  const templates = EXPENSE_TEMPLATES[dbEvent.eventType] || EXPENSE_TEMPLATES.event;
  const eventDate = new Date(dbEvent.eventDate).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  // Filter to only expense transactions (negative amounts) linked to this event
  const expenses = linkedTransactions.filter((tx) => tx.category !== 'TRF');
  const totalPlanned = expenses.reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  const totalPaid = expenses.filter((tx) => tx.cleared).reduce((sum, tx) => sum + Math.abs(tx.amount), 0);
  const remaining = totalPlanned - totalPaid;

  const handleQuickAdd = (template) => {
    setForm({ title: template.title, amount: '', category: template.category, accountId: defaultAccountId });
    setAdding(true);
  };

  const handleSave = async () => {
    const amount = parseFloat(form.amount);
    if (!form.title || !amount) return;
    setSaving(true);
    try {
      const eventDate = dbEvent.eventDate.split('T')[0];
      const detectedSeason = getSeasonForDate(eventDate, seasonIds);
      await onSaveExpense({
        title: form.title,
        amount: amount > 0 ? -amount : amount, // expenses are negative
        date: eventDate,
        category: form.category,
        accountId: form.accountId || null,
        cleared: false,
        eventId: dbEvent.id,
        playerId: '',
        ...(detectedSeason ? { seasonId: detectedSeason } : {}),
      });
      setForm({ title: '', amount: '', category: 'OPE', accountId: defaultAccountId });
      setAdding(false);
    } finally {
      setSaving(false);
    }
  };

  // Which template titles already have an expense created?
  const existingTitles = new Set(expenses.map((tx) => tx.title.toLowerCase()));

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center p-4 z-50">
      <div className="bg-card rounded-lg shadow-md w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className={`px-6 py-4 shrink-0 ${eventType.color} text-white`}>
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold opacity-70 mb-0.5">{t('expenses.title', { type: eventType.label })}</p>
              <h3 className="font-semibold text-lg leading-tight">{dbEvent.title}</h3>
              <p className="text-xs opacity-80 mt-1">{eventDate}</p>
              {dbEvent.location && <p className="text-xs opacity-70 mt-0.5">{dbEvent.location}</p>}
            </div>
            <button onClick={onClose} className="text-white/60 hover:text-white font-semibold text-xl ml-4">
              &times;
            </button>
          </div>
        </div>

        <div className="overflow-y-auto flex-1">
          {/* Summary bar */}
          <div className="px-6 py-3 bg-background border-b border-border flex items-center justify-between text-xs">
            <div className="flex items-center gap-4">
              <span className="font-semibold text-muted-foreground">
                {t('expenses.planned')} <span className="text-foreground">${totalPlanned.toFixed(2)}</span>
              </span>
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                {t('expenses.paidLabel')} ${totalPaid.toFixed(2)}
              </span>
            </div>
            {remaining > 0 && (
              <span className="font-bold text-amber-700 dark:text-amber-400 bg-amber-50 px-2 py-0.5 rounded-full">
                {t('expenses.unpaid', { amount: `$${remaining.toFixed(2)}` })}
              </span>
            )}
            {remaining === 0 && expenses.length > 0 && (
              <span className="font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 px-2 py-0.5 rounded-full">
                {t('expenses.allPaid')}
              </span>
            )}
          </div>

          {/* Existing expenses */}
          <div className="px-6 py-4 space-y-2">
            {expenses.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Receipt size={24} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm font-semibold">{t('expenses.noExpenses')}</p>
                <p className="text-xs mt-0.5">{t('expenses.addExpenseHint')}</p>
              </div>
            ) : (
              expenses.map((tx) => {
                const txDate = tx.date?.seconds
                  ? new Date(tx.date.seconds * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                  : '';
                return (
                  <div
                    key={tx.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${
                      tx.cleared
                        ? 'bg-emerald-50/50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-700'
                        : 'bg-card border-border border-dashed'
                    }`}
                  >
                    <button
                      onClick={() => onToggleCleared(tx.id, !tx.cleared)}
                      className="shrink-0"
                      title={tx.cleared ? t('expenses.markUnpaid') : t('expenses.markPaid')}
                    >
                      {tx.cleared ? (
                        <CheckCircle2 size={20} className="text-emerald-700 dark:text-emerald-400" />
                      ) : (
                        <Clock size={20} className="text-amber-400" />
                      )}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-bold px-1.5 py-0.5 rounded ${
                            CATEGORY_COLORS[tx.category] || 'bg-muted text-foreground'
                          }`}
                        >
                          {CATEGORY_LABELS[tx.category] || tx.category}
                        </span>
                        <span
                          className={`text-sm font-semibold truncate ${tx.cleared ? 'text-muted-foreground line-through' : 'text-foreground'}`}
                        >
                          {tx.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground font-medium">{txDate}</span>
                        {accountMap[tx.accountId]?.name && (
                          <span className="text-xs text-muted-foreground font-medium">
                            · {accountMap[tx.accountId].name}
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className={`font-bold text-sm shrink-0 ${tx.cleared ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}
                    >
                      ${Math.abs(tx.amount).toFixed(2)}
                    </span>
                    <button
                      onClick={() => onDeleteExpense(tx.id)}
                      className="shrink-0 text-muted-foreground hover:text-red-700 dark:text-red-400 transition-colors"
                      title={t('expenses.deleteExpense')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Quick-add templates */}
          {!adding && (
            <div className="px-6 pb-4">
              <p className="text-xs font-bold text-muted-foreground mb-2">{t('expenses.suggested')}</p>
              <div className="flex flex-wrap gap-1.5">
                {templates.map((tmpl, i) => {
                  const alreadyAdded = existingTitles.has(tmpl.title.toLowerCase());
                  return (
                    <button
                      key={i}
                      onClick={() => handleQuickAdd(tmpl)}
                      disabled={alreadyAdded}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                        alreadyAdded
                          ? 'bg-background text-muted-foreground cursor-default'
                          : 'bg-muted text-foreground hover:bg-muted hover:text-foreground dark:hover:text-white'
                      }`}
                    >
                      {alreadyAdded ? <CheckCircle2 size={11} /> : <Plus size={11} />}
                      {tmpl.title}
                    </button>
                  );
                })}
                <button
                  onClick={() => {
                    setForm({ title: '', amount: '', category: 'OPE', accountId: defaultAccountId });
                    setAdding(true);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 dark:text-blue-400 hover:bg-blue-100 transition-all"
                >
                  <Plus size={11} /> {t('expenses.custom')}
                </button>
              </div>
            </div>
          )}

          {/* Add expense form */}
          {adding && (
            <div className="px-6 pb-4">
              <div className="bg-background border border-border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-muted-foreground">{t('expenses.newExpense')}</p>
                  <button onClick={() => setAdding(false)} className="text-muted-foreground hover:text-foreground">
                    <X size={14} />
                  </button>
                </div>
                <input
                  type="text"
                  placeholder={t('expenses.description')}
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full border border-border rounded-lg p-2 text-sm focus:ring-2 focus:ring-ring outline-none"
                />
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-0.5">
                      {t('expenses.amountLabel')}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                      className="w-full border border-border rounded-lg p-2 text-sm focus:ring-2 focus:ring-ring outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-0.5">
                      {t('expenses.category')}
                    </label>
                    <select
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      className="w-full border border-border rounded-lg p-2 text-sm focus:ring-2 focus:ring-ring outline-none"
                    >
                      <option value="OPE">{CATEGORY_LABELS.OPE}</option>
                      <option value="TOU">{CATEGORY_LABELS.TOU}</option>
                      <option value="LEA">{CATEGORY_LABELS.LEA}</option>
                      <option value="FRI">{CATEGORY_LABELS.FRI}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-0.5">
                      {t('txModal.account')}
                    </label>
                    <select
                      value={form.accountId || ''}
                      onChange={(e) => setForm({ ...form, accountId: e.target.value })}
                      className="w-full border border-border rounded-lg p-2 text-sm focus:ring-2 focus:ring-ring outline-none"
                    >
                      <option value="">{t('txModal.noAccount')}</option>
                      {HOLDINGS.filter((h) => h !== 'none' && accountsByHolding[h]?.length > 0).map((h) => (
                        <optgroup key={h} label={HOLDING_LABELS[h]}>
                          {accountsByHolding[h].map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setAdding(false)}
                    className="px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted rounded-lg transition-colors"
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || !form.title || !form.amount}
                    className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1"
                  >
                    <DollarSign size={12} />
                    {saving ? t('common.saving') : t('expenses.addAsDraft')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
