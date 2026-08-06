import React, { useState, useEffect, useMemo } from 'react';
import { HandCoins, Handshake } from 'lucide-react';
import { useT } from '../i18n/I18nContext';
import { HOLDINGS, HOLDING_LABELS } from '../utils/holdings';
import ResponsiveModal from './layout/ResponsiveModal';

// Intake for money the team brings in from sponsors and fundraisers. Saving writes
// the SPO/FUN ledger entry straight away — the deposit is on the books whether or
// not it has been split across players yet — and the new entry then shows up in
// Pending Distributions on the same page.
export default function RecordFundsModal({ show, onClose, onSubmit, players = [], activeAccounts = [] }) {
  const { t } = useT();
  const defaultAccountId = activeAccounts[0]?.id || '';
  const emptyForm = useMemo(
    () => ({
      category: 'SPO',
      title: '',
      amount: '',
      date: new Date().toISOString().split('T')[0],
      accountId: defaultAccountId,
      playerId: '',
      playerName: '',
      cleared: true,
    }),
    [defaultAccountId],
  );

  const [formData, setFormData] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (show) {
      setFormData(emptyForm);
      setError('');
    }
  }, [show, emptyForm]);

  const accountsByHolding = useMemo(() => {
    const grouped = {};
    HOLDINGS.forEach((h) => {
      grouped[h] = [];
    });
    activeAccounts.forEach((a) => {
      if (grouped[a.holding]) grouped[a.holding].push(a);
    });
    return grouped;
  }, [activeAccounts]);

  if (!show) return null;

  const isSponsorship = formData.category === 'SPO';

  const handleSubmit = async (e) => {
    e.preventDefault();
    const amount = parseFloat(formData.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError(t('sponsors.record.amountError'));
      return;
    }

    setIsSaving(true);
    setError('');
    try {
      const result = await onSubmit({ ...formData, amount });
      // handleSaveTransaction reports failures in-band rather than throwing.
      if (result && result.success === false) {
        setError(result.error);
        return;
      }
      onClose();
    } catch (err) {
      setError(err.message || t('sponsors.record.saveError'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    // Opens over the distribution panel, hence the raised stacking context.
    <ResponsiveModal as="form" onSubmit={handleSubmit} onClose={onClose} size="lg" overlayClassName="z-[1060]">
      <ResponsiveModal.Header className="bg-emerald-600 text-white">
        <h3 className="font-semibold text-lg flex items-center gap-2">
          <HandCoins size={18} /> {t('sponsors.record.heading')}
        </h3>
      </ResponsiveModal.Header>

      <ResponsiveModal.Body className="space-y-4">
        {/* Type — decides the ledger category the entry lands under */}
        <div>
          <label className="block text-sm font-semibold text-foreground mb-1">{t('sponsors.record.type')}</label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { code: 'SPO', label: t('sponsors.record.typeSponsorship'), Icon: Handshake },
              { code: 'FUN', label: t('sponsors.record.typeFundraiser'), Icon: HandCoins },
            ].map((option) => {
              const { code, label } = option;
              const selected = formData.category === code;
              return (
                <button
                  key={code}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setFormData({ ...formData, category: code })}
                  className={`flex items-center justify-center gap-2 py-2.5 rounded-lg border font-semibold text-sm transition-all ${
                    selected
                      ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-500'
                      : 'border-border bg-card text-muted-foreground hover:border-emerald-300 dark:hover:border-emerald-700'
                  }`}
                >
                  <option.Icon size={15} /> {label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-foreground mb-1" htmlFor="funds-title">
            {isSponsorship ? t('sponsors.record.sponsorName') : t('sponsors.record.eventName')}
          </label>
          <input
            required
            id="funds-title"
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            className="w-full border border-border rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 outline-none"
            placeholder={
              isSponsorship ? t('sponsors.record.sponsorPlaceholder') : t('sponsors.record.eventPlaceholder')
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-foreground mb-1" htmlFor="funds-amount">
              {t('sponsors.record.amount')}
            </label>
            <input
              required
              id="funds-amount"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              className="w-full border border-border rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 outline-none"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-foreground mb-1" htmlFor="funds-date">
              {t('common.date')}
            </label>
            <input
              required
              id="funds-date"
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              className="w-full border border-border rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-semibold text-foreground mb-1" htmlFor="funds-account">
            {t('sponsors.record.account')}
          </label>
          <select
            id="funds-account"
            value={formData.accountId || ''}
            onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
            className="w-full border border-border rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 outline-none"
          >
            <option value="">{t('sponsors.record.noAccount')}</option>
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

        {/* Attribution only — who brought the money in. It does not credit the
              player on its own; that happens when the funds are distributed. */}
        <div>
          <label className="block text-sm font-semibold text-foreground mb-1" htmlFor="funds-player">
            {t('sponsors.record.broughtInBy')}
          </label>
          <select
            id="funds-player"
            value={formData.playerId}
            onChange={(e) => {
              const player = players.find((p) => p.id === e.target.value);
              setFormData({
                ...formData,
                playerId: e.target.value,
                playerName: player ? `${player.firstName} ${player.lastName}` : '',
              });
            }}
            className="w-full border border-border rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 outline-none"
          >
            <option value="">{t('sponsors.record.noPlayer')}</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.firstName} {p.lastName}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground mt-1.5">{t('sponsors.record.broughtInByHelp')}</p>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <input
            type="checkbox"
            id="funds-cleared"
            checked={formData.cleared}
            onChange={(e) => setFormData({ ...formData, cleared: e.target.checked })}
            className="w-4 h-4 text-emerald-700 dark:text-emerald-400 rounded focus:ring-emerald-500"
          />
          <label htmlFor="funds-cleared" className="text-sm font-semibold text-foreground">
            {t('sponsors.record.received')}
          </label>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">{t('sponsors.record.receivedHelp')}</p>

        {error && (
          <p className="text-sm font-semibold text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg p-3">
            {error}
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
          disabled={isSaving}
          className="font-semibold py-2 px-6 rounded-lg shadow-sm transition-colors disabled:opacity-50 text-white bg-emerald-600 hover:bg-emerald-700"
        >
          {isSaving ? t('common.saving') : t('sponsors.record.save')}
        </button>
      </ResponsiveModal.Footer>
    </ResponsiveModal>
  );
}
