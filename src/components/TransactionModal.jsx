import React, { useState, useEffect, useMemo } from 'react';
import { ArrowRightLeft, Link2 } from 'lucide-react';
import { useT } from '../i18n/I18nContext';
import { HOLDINGS, HOLDING_LABELS } from '../utils/holdings';

export default function TransactionModal({
  show,
  onClose,
  onSubmit,
  initialData,
  isSubmitting,
  players,
  teamEvents = [],
  activeAccounts = [],
  isReadOnly = false,
}) {
  const defaultAccountId = activeAccounts[0]?.id || '';
  const [formData, setFormData] = useState({
    title: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    category: 'TMF',
    accountId: defaultAccountId,
    transferFromAccountId: '',
    transferToAccountId: '',
    playerId: '',
    cleared: false,
    eventId: '',
  });

  useEffect(() => {
    if (initialData) {
      let formattedDate = new Date().toISOString().split('T')[0];
      if (initialData.date && initialData.date.seconds) {
        formattedDate = new Date(initialData.date.seconds * 1000).toISOString().split('T')[0];
      }
      setFormData({
        ...initialData,
        date: formattedDate,
        accountId: initialData.accountId || '',
        transferFromAccountId: initialData.transferFromAccountId || '',
        transferToAccountId: initialData.transferToAccountId || '',
        eventId: initialData.eventId || '',
      });
    } else {
      setFormData({
        title: '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        category: 'TMF',
        accountId: defaultAccountId,
        transferFromAccountId: '',
        transferToAccountId: '',
        playerId: '',
        cleared: false,
        eventId: '',
      });
    }
  }, [initialData, show, defaultAccountId]);

  // Group active accounts by holding for grouped <select> optgroups
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

  const { t } = useT();

  if (!show) return null;

  const isTransfer = formData.category === 'TRF';

  const handleCategoryChange = (newCategory) => {
    const updates = { category: newCategory };
    if (newCategory === 'TRF') {
      // Pre-fill with first two distinct active accounts so the transfer form isn't empty.
      const firstTwo = activeAccounts.slice(0, 2);
      updates.transferFromAccountId = formData.transferFromAccountId || firstTwo[0]?.id || '';
      updates.transferToAccountId = formData.transferToAccountId || firstTwo[1]?.id || firstTwo[0]?.id || '';
      updates.accountId = '';
      updates.playerId = '';
      updates.playerName = '';
      updates.cleared = true;
    } else {
      updates.transferFromAccountId = '';
      updates.transferToAccountId = '';
    }
    // Credit category is bookkeeping only — it never touches a real account.
    if (newCategory === 'CRE') {
      updates.accountId = '';
    }
    setFormData({ ...formData, ...updates });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const amount = parseFloat(formData.amount) || 0;
    onSubmit({
      ...formData,
      amount: isTransfer ? Math.abs(amount) : amount,
    });
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex justify-center items-center p-4 z-50">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl dark:shadow-none w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        <div
          className={`px-6 py-4 flex justify-between items-center text-white shrink-0 ${
            isTransfer ? 'bg-indigo-600' : 'bg-emerald-600'
          }`}
        >
          <h3 className="font-bold text-lg flex items-center gap-2">
            {isTransfer && <ArrowRightLeft size={18} />}
            {initialData ? t('txModal.editTitle') : isTransfer ? t('txModal.transferTitle') : t('txModal.addTitle')}
          </h3>
          <button type="button" onClick={onClose} className="text-white/60 hover:text-white font-bold text-xl">
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
          {isReadOnly && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-300 text-xs font-semibold">
              <span>👁</span>
              <span>{t('impersonation.viewingAs', 'Viewing as parent — read-only mode')}</span>
            </div>
          )}
          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">
              {isTransfer ? t('txModal.transferDesc') : t('txModal.titleLabel')}
            </label>
            <input
              required
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 outline-none dark:bg-slate-800 dark:text-white"
              placeholder={isTransfer ? t('txModal.transferPlaceholder') : t('txModal.titlePlaceholder')}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">
                {t('txModal.amount')}
              </label>
              <input
                required
                type="number"
                step="0.01"
                value={formData.amount}
                onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 outline-none dark:bg-slate-800 dark:text-white"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">
                {t('common.date')}
              </label>
              <input
                required
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 outline-none dark:bg-slate-800 dark:text-white"
              />
            </div>
          </div>

          {/* Category */}
          <div className={`grid ${formData.category === 'CRE' || isTransfer ? 'grid-cols-1' : 'grid-cols-2'} gap-4`}>
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">
                {t('txModal.category')}
              </label>
              <select
                value={formData.category}
                onChange={(e) => handleCategoryChange(e.target.value)}
                className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 outline-none dark:bg-slate-800 dark:text-white"
              >
                <option value="TMF">{t('txModal.catTeamFees')}</option>
                <option value="FUN">{t('txModal.catFundraising')}</option>
                <option value="SPO">{t('txModal.catSponsorship')}</option>
                <option value="OPE">{t('txModal.catOperating')}</option>
                <option value="TOU">{t('txModal.catTournament')}</option>
                <option value="LEA">{t('txModal.catLeague')}</option>
                <option value="CRE">{t('txModal.catCredit')}</option>
                <option value="TRF">{t('txModal.catTransfer')}</option>
              </select>
            </div>
            {!isTransfer && formData.category !== 'CRE' && (
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">
                  {t('txModal.account')}
                </label>
                <select
                  value={formData.accountId || ''}
                  onChange={(e) => setFormData({ ...formData, accountId: e.target.value })}
                  className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 outline-none dark:bg-slate-800 dark:text-white"
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
            )}
          </div>

          {/* ── TRANSFER: From / To Account ── */}
          {isTransfer && (
            <div className="bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 rounded-xl p-4 space-y-3">
              <p className="text-xs font-black text-indigo-600 uppercase tracking-widest">
                {t('txModal.transferDetails')}
              </p>
              <div className="grid grid-cols-[1fr,auto,1fr] gap-2 items-end">
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                    {t('txModal.fromAccount')}
                  </label>
                  <select
                    value={formData.transferFromAccountId || ''}
                    onChange={(e) => setFormData({ ...formData, transferFromAccountId: e.target.value })}
                    className="w-full border border-indigo-200 dark:border-indigo-700 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-800 dark:text-white"
                  >
                    {HOLDINGS.filter((h) => h !== 'none' && accountsByHolding[h]?.length > 0).map((h) => (
                      <optgroup key={h} label={HOLDING_LABELS[h]}>
                        {accountsByHolding[h].map((a) => (
                          <option key={a.id} value={a.id} disabled={a.id === formData.transferToAccountId}>
                            {a.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div className="pb-2">
                  <ArrowRightLeft size={18} className="text-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">
                    {t('txModal.toAccount')}
                  </label>
                  <select
                    value={formData.transferToAccountId || ''}
                    onChange={(e) => setFormData({ ...formData, transferToAccountId: e.target.value })}
                    className="w-full border border-indigo-200 dark:border-indigo-700 rounded-lg p-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white dark:bg-slate-800 dark:text-white"
                  >
                    {HOLDINGS.filter((h) => h !== 'none' && accountsByHolding[h]?.length > 0).map((h) => (
                      <optgroup key={h} label={HOLDING_LABELS[h]}>
                        {accountsByHolding[h].map((a) => (
                          <option key={a.id} value={a.id} disabled={a.id === formData.transferFromAccountId}>
                            {a.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              </div>
              {formData.transferFromAccountId === formData.transferToAccountId && formData.transferFromAccountId && (
                <p className="text-xs text-red-500 font-bold">{t('txModal.sameAccountError')}</p>
              )}
            </div>
          )}

          {/* Player link (hidden for transfers) */}
          {!isTransfer && (
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">
                {t('txModal.linkPlayer')}
              </label>
              <select
                value={formData.playerId}
                onChange={(e) => {
                  const selectedPlayer = players.find((p) => p.id === e.target.value);
                  setFormData({
                    ...formData,
                    playerId: e.target.value,
                    playerName: selectedPlayer ? `${selectedPlayer.firstName} ${selectedPlayer.lastName}` : '',
                  });
                }}
                className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 outline-none dark:bg-slate-800 dark:text-white"
              >
                <option value="">{t('txModal.generalExpense')}</option>
                {players.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.firstName} {p.lastName}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Event link (hidden for transfers, only shown when events exist) */}
          {!isTransfer && teamEvents.length > 0 && (
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                <Link2 size={13} className="text-slate-400" /> {t('txModal.linkEvent')}
              </label>
              <select
                value={formData.eventId}
                onChange={(e) => setFormData({ ...formData, eventId: e.target.value })}
                className="w-full border border-slate-300 dark:border-slate-700 rounded-lg p-2 focus:ring-2 focus:ring-emerald-500 outline-none dark:bg-slate-800 dark:text-white"
              >
                <option value="">{t('txModal.noEventLinked')}</option>
                {teamEvents.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {new Date(ev.eventDate).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                    })}{' '}
                    — {ev.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Cleared checkbox (hidden for transfers — they auto-clear) */}
          {!isTransfer && (
            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="cleared"
                checked={formData.cleared}
                onChange={(e) => setFormData({ ...formData, cleared: e.target.checked })}
                className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
              />
              <label htmlFor="cleared" className="text-sm font-bold text-slate-700 dark:text-slate-300">
                {t('txModal.fundsCleared')}
              </label>
            </div>
          )}

          <div className="pt-4 border-t border-slate-100 dark:border-slate-700 flex justify-end gap-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={
                isSubmitting ||
                isReadOnly ||
                (isTransfer && formData.transferFromAccountId === formData.transferToAccountId) ||
                (isTransfer && !formData.transferFromAccountId)
              }
              className={`font-bold py-2 px-6 rounded-lg shadow-sm dark:shadow-none transition-colors disabled:opacity-50 text-white ${
                isTransfer ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-emerald-600 hover:bg-emerald-700'
              }`}
            >
              {isSubmitting
                ? t('common.saving')
                : isTransfer
                  ? t('txModal.recordTransfer')
                  : t('txModal.saveTransaction')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
