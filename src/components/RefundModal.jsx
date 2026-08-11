import React, { useState } from 'react';
import { Undo2 } from 'lucide-react';
import { useT } from '../i18n/I18nContext';
import { refundableRemaining } from '../utils/refunds';
import ResponsiveModal from './layout/ResponsiveModal';

export default function RefundModal({
  show,
  onClose,
  onSubmit,
  transaction,
  refundIndex = {},
  isSubmitting,
  formatMoney,
}) {
  const { t } = useT();
  const remaining = refundableRemaining(transaction, refundIndex);

  // Prefilled with the full outstanding amount — a full refund is the common
  // case and a partial is one keystroke away. The caller keys this component by
  // transaction id, so opening it on a different row remounts with fresh state.
  const [amount, setAmount] = useState(() => (remaining ? remaining.toFixed(2) : ''));
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [cleared, setCleared] = useState(true);

  if (!show || !transaction) return null;

  const entered = Math.round((Math.abs(Number(amount)) || 0) * 100) / 100;
  const exceeds = entered > remaining;
  const alreadyRefunded = Math.abs(transaction.amount) - remaining;
  // A refund reverses the original, so it lands on the opposite side of the ledger.
  const signedPreview = transaction.amount < 0 ? entered : -entered;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!entered || exceeds) return;
    onSubmit({ amount: entered, date, notes, cleared });
  };

  return (
    <ResponsiveModal as="form" onSubmit={handleSubmit} onClose={onClose} size="md">
      <ResponsiveModal.Header className="text-white bg-amber-600">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <Undo2 size={18} /> {t('refundModal.title')}
        </h3>
      </ResponsiveModal.Header>

      <ResponsiveModal.Body className="space-y-4">
        <p className="text-xs text-muted-foreground font-medium">{t('refundModal.subtitle')}</p>

        {/* Original transaction summary */}
        <div className="bg-muted rounded-lg p-3 space-y-1">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">{t('refundModal.original')}</p>
          <div className="flex justify-between items-baseline gap-3">
            <span className="text-sm font-semibold text-foreground truncate">{transaction.title}</span>
            <span
              className={`text-sm font-bold whitespace-nowrap ${transaction.amount < 0 ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'}`}
            >
              {transaction.amount < 0 ? '-' : '+'}
              {formatMoney(Math.abs(transaction.amount))}
            </span>
          </div>
          <div className="flex justify-between items-baseline gap-3 text-xs font-semibold">
            <span className="text-muted-foreground">{t('refundModal.outstanding')}</span>
            <span className="text-foreground">
              {formatMoney(remaining)}
              {alreadyRefunded > 0 && (
                <span className="text-muted-foreground font-medium ml-1">
                  ({t('ledger.refundedAmount', { amount: formatMoney(alreadyRefunded) })})
                </span>
              )}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-foreground mb-1">{t('refundModal.amount')}</label>
            <input
              required
              autoFocus
              type="number"
              step="0.01"
              min="0"
              max={remaining}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full border border-border rounded-lg p-2 focus:ring-2 focus:ring-amber-500 outline-none"
              placeholder="0.00"
            />
            <button
              type="button"
              onClick={() => setAmount(remaining.toFixed(2))}
              className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-400 hover:underline"
            >
              {t('refundModal.full')}
            </button>
          </div>
          <div>
            <label className="block text-sm font-semibold text-foreground mb-1">{t('refundModal.date')}</label>
            <input
              required
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-border rounded-lg p-2 focus:ring-2 focus:ring-amber-500 outline-none"
            />
          </div>
        </div>

        {exceeds && <p className="text-xs text-red-700 dark:text-red-400 font-semibold">{t('refundModal.exceeds')}</p>}

        <div>
          <label className="block text-sm font-semibold text-foreground mb-1">{t('refundModal.notes')}</label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full border border-border rounded-lg p-2 focus:ring-2 focus:ring-amber-500 outline-none"
            placeholder={t('refundModal.notesPlaceholder')}
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="refund-cleared"
            checked={cleared}
            onChange={(e) => setCleared(e.target.checked)}
            className="w-4 h-4 rounded focus:ring-amber-500"
          />
          <label htmlFor="refund-cleared" className="text-sm font-semibold text-foreground">
            {t('refundModal.cleared')}
          </label>
        </div>

        {entered > 0 && !exceeds && (
          <p className="text-xs text-muted-foreground font-medium bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-2.5">
            {t('refundModal.preview', {
              amount: `${signedPreview < 0 ? '-' : '+'}${formatMoney(Math.abs(signedPreview))}`,
              date,
            })}
          </p>
        )}
      </ResponsiveModal.Body>

      <ResponsiveModal.Footer>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 font-semibold text-muted-foreground hover:bg-muted rounded-lg transition-colors"
        >
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          disabled={isSubmitting || !entered || exceeds}
          className="font-semibold py-2 px-6 rounded-lg shadow-sm transition-colors disabled:opacity-50 text-white bg-amber-600 hover:bg-amber-700"
        >
          {isSubmitting ? t('refundModal.submitting') : t('refundModal.submit')}
        </button>
      </ResponsiveModal.Footer>
    </ResponsiveModal>
  );
}
