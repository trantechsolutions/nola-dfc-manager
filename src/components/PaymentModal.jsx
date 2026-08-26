import React, { useState } from 'react';
import { HandCoins } from 'lucide-react';
import { useT } from '../i18n/I18nContext';
import { planProgress } from '../utils/installments';
import ResponsiveModal from './layout/ResponsiveModal';

export default function PaymentModal({
  show,
  onClose,
  onSubmit,
  transaction,
  installmentIndex = {},
  activeAccounts = [],
  isSubmitting,
  formatMoney,
}) {
  const { t } = useT();
  const { total, paid, remaining } = planProgress(transaction, installmentIndex);

  // Left blank rather than prefilled with the outstanding balance: this dialog
  // exists because the whole amount is not being paid, so the figure is always
  // typed. The "pay it off" shortcut is one tap away for the case where it is.
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [accountId, setAccountId] = useState(() => transaction?.accountId || '');
  const [notes, setNotes] = useState('');
  const [cleared, setCleared] = useState(true);

  if (!show || !transaction) return null;

  const entered = Math.round((Math.abs(Number(amount)) || 0) * 100) / 100;
  const exceeds = entered > remaining;
  const settles = entered > 0 && !exceeds && Math.round((remaining - entered) * 100) / 100 === 0;
  // A payment lands on the same side of the ledger as what it pays off.
  const signedPreview = transaction.amount < 0 ? -entered : entered;
  const percentPaid = total > 0 ? Math.min(100, Math.round((paid / total) * 100)) : 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!entered || exceeds) return;
    onSubmit({ amount: entered, date, notes, cleared, accountId: accountId || null });
  };

  return (
    <ResponsiveModal as="form" onSubmit={handleSubmit} onClose={onClose} size="md">
      <ResponsiveModal.Header className="bg-emerald-600 text-white">
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <HandCoins size={18} /> {t('paymentModal.title')}
        </h3>
      </ResponsiveModal.Header>

      <ResponsiveModal.Body className="space-y-4">
        <p className="text-xs font-medium text-muted-foreground">{t('paymentModal.subtitle')}</p>

        {/* What is owed, and how far along the plan already is */}
        <div className="space-y-2 rounded-lg bg-muted p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{t('paymentModal.owed')}</p>
          <div className="flex items-baseline justify-between gap-3">
            <span className="truncate text-sm font-semibold text-foreground">{transaction.title}</span>
            <span className="whitespace-nowrap text-sm font-bold text-foreground">{formatMoney(total)}</span>
          </div>

          <div className="h-1.5 overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${percentPaid}%` }}
              role="progressbar"
              aria-valuenow={percentPaid}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={t('paymentModal.progressLabel')}
            />
          </div>

          <div className="flex items-baseline justify-between gap-3 text-xs font-semibold">
            <span className="text-muted-foreground">{t('paymentModal.paidSoFar', { amount: formatMoney(paid) })}</span>
            <span className="text-foreground">{t('paymentModal.remaining', { amount: formatMoney(remaining) })}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="payment-amount" className="mb-1 block text-sm font-semibold text-foreground">
              {t('paymentModal.amount')}
            </label>
            <input
              required
              autoFocus
              id="payment-amount"
              type="number"
              step="0.01"
              min="0"
              max={remaining}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-lg border border-border p-2 outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="0.00"
            />
            <button
              type="button"
              onClick={() => setAmount(remaining.toFixed(2))}
              className="mt-1 text-xs font-semibold text-emerald-700 hover:underline dark:text-emerald-400"
            >
              {t('paymentModal.payOff')}
            </button>
          </div>
          <div>
            <label htmlFor="payment-date" className="mb-1 block text-sm font-semibold text-foreground">
              {t('paymentModal.date')}
            </label>
            <input
              required
              id="payment-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-lg border border-border p-2 outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        {exceeds && <p className="text-xs font-semibold text-red-700 dark:text-red-400">{t('paymentModal.exceeds')}</p>}

        {/* Each instalment can land somewhere different — cash this month, a
            transfer the next — so the account is chosen per payment. */}
        {activeAccounts.length > 0 && (
          <div>
            <label htmlFor="payment-account" className="mb-1 block text-sm font-semibold text-foreground">
              {t('paymentModal.account')}
            </label>
            <select
              id="payment-account"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="w-full rounded-lg border border-border bg-card p-2 outline-none focus:ring-2 focus:ring-emerald-500"
            >
              <option value="">{t('paymentModal.noAccount')}</option>
              {activeAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label htmlFor="payment-notes" className="mb-1 block text-sm font-semibold text-foreground">
            {t('paymentModal.notes')}
          </label>
          <input
            id="payment-notes"
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded-lg border border-border p-2 outline-none focus:ring-2 focus:ring-emerald-500"
            placeholder={t('paymentModal.notesPlaceholder')}
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="payment-cleared"
            checked={cleared}
            onChange={(e) => setCleared(e.target.checked)}
            className="h-4 w-4 rounded focus:ring-emerald-500"
          />
          <label htmlFor="payment-cleared" className="text-sm font-semibold text-foreground">
            {t('paymentModal.cleared')}
          </label>
        </div>

        {entered > 0 && !exceeds && (
          <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs font-medium text-muted-foreground dark:border-emerald-700 dark:bg-emerald-900/20">
            {t('paymentModal.preview', {
              amount: `${signedPreview < 0 ? '-' : '+'}${formatMoney(Math.abs(signedPreview))}`,
              date,
            })}{' '}
            {settles
              ? t('paymentModal.previewSettles')
              : t('paymentModal.previewLeaves', { amount: formatMoney(Math.round((remaining - entered) * 100) / 100) })}
          </p>
        )}
      </ResponsiveModal.Body>

      <ResponsiveModal.Footer>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-4 py-2 font-semibold text-muted-foreground transition-colors hover:bg-muted"
        >
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          disabled={isSubmitting || !entered || exceeds}
          className="rounded-lg bg-emerald-600 px-6 py-2 font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
        >
          {isSubmitting ? t('paymentModal.submitting') : t('paymentModal.submit')}
        </button>
      </ResponsiveModal.Footer>
    </ResponsiveModal>
  );
}
