import { useState, useEffect } from 'react';
import { Rss, CreditCard, CheckCircle2, AlertCircle, Edit, Save, X, Loader2 } from 'lucide-react';
import { supabaseService } from '../../services/supabaseService';
import { useT } from '../../i18n/I18nContext';
import AccountManager from '../../components/AccountManager';

export default function TeamSettingsView({
  selectedTeam,
  refreshContext,
  showToast,
  accounts = [],
  onSaveAccount,
  onDeleteAccount,
  isAccountSaving = false,
}) {
  const { t } = useT();

  // ── iCal state ──
  const [isEditingIcs, setIsEditingIcs] = useState(false);
  const [icsUrl, setIcsUrl] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [isSavingIcs, setIsSavingIcs] = useState(false);

  // ── Payment info state ──
  const [paymentInfo, setPaymentInfo] = useState(selectedTeam?.paymentInfo || '');
  const [isSavingPayment, setIsSavingPayment] = useState(false);

  useEffect(() => {
    setPaymentInfo(selectedTeam?.paymentInfo || '');
  }, [selectedTeam?.id]);

  const currentIcsUrl = selectedTeam?.icalUrl || '';

  // ── iCal handlers ──
  const handleStartEdit = () => {
    setIcsUrl(currentIcsUrl);
    setIsEditingIcs(true);
    setTestResult(null);
  };
  const handleCancelEdit = () => {
    setIsEditingIcs(false);
    setIcsUrl('');
    setTestResult(null);
  };

  const handleTestUrl = async () => {
    if (!icsUrl.trim()) {
      setTestResult('invalid');
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(icsUrl.trim());
      const text = await res.text();
      setTestResult(text.includes('BEGIN:VCALENDAR') ? 'valid' : 'invalid');
    } catch {
      setTestResult('invalid');
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveIcs = async () => {
    if (!selectedTeam?.id) return;
    setIsSavingIcs(true);
    try {
      await supabaseService.updateTeam(selectedTeam.id, { icalUrl: icsUrl.trim() });
      setIsEditingIcs(false);
      setTestResult(null);
      if (refreshContext) await refreshContext();
      if (showToast) showToast('Calendar feed updated.');
    } catch (err) {
      if (showToast) showToast(`Failed: ${err.message}`, true);
    } finally {
      setIsSavingIcs(false);
    }
  };

  const handleRemoveIcs = async () => {
    if (!selectedTeam?.id) return;
    setIsSavingIcs(true);
    try {
      await supabaseService.updateTeam(selectedTeam.id, { icalUrl: '' });
      setIsEditingIcs(false);
      setIcsUrl('');
      setTestResult(null);
      if (refreshContext) await refreshContext();
      if (showToast) showToast('Calendar feed removed.');
    } catch (err) {
      if (showToast) showToast(`Failed: ${err.message}`, true);
    } finally {
      setIsSavingIcs(false);
    }
  };

  // ── Payment info handler ──
  const handleSavePayment = async () => {
    if (!selectedTeam?.id) return;
    setIsSavingPayment(true);
    try {
      await supabaseService.updateTeam(selectedTeam.id, { paymentInfo: paymentInfo.trim() });
      if (refreshContext) await refreshContext();
      if (showToast) showToast('Payment info saved.');
    } catch (err) {
      if (showToast) showToast(`Failed: ${err.message}`, true);
    } finally {
      setIsSavingPayment(false);
    }
  };

  return (
    <div className="space-y-6 pb-20 md:pb-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-black text-slate-900 dark:text-white">{t('settings.title')}</h2>
        <p className="text-xs text-slate-400 font-bold mt-0.5">{selectedTeam?.name}</p>
      </div>

      {/* ── iCal Feed ── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none overflow-hidden">
        <div className="p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-xl">
              <Rss size={16} className="text-slate-500" />
            </div>
            <div>
              <p className="text-sm font-black text-slate-800 dark:text-white">{t('settings.calendarFeed')}</p>
              {currentIcsUrl ? (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <CheckCircle2 size={11} className="text-emerald-500" />
                  <span className="text-[10px] text-slate-400 font-medium truncate max-w-[300px]">{currentIcsUrl}</span>
                </div>
              ) : (
                <p className="text-[10px] text-amber-600 font-bold mt-0.5 flex items-center gap-1">
                  <AlertCircle size={11} /> {t('settings.noFeed')}
                </p>
              )}
            </div>
          </div>
          {!isEditingIcs && (
            <button
              onClick={handleStartEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-lg transition-colors"
            >
              <Edit size={12} /> {currentIcsUrl ? t('common.edit') : t('settings.addFeed')}
            </button>
          )}
        </div>

        {isEditingIcs && (
          <div className="border-t border-slate-100 dark:border-slate-700 p-5 bg-slate-50 dark:bg-slate-800 space-y-3">
            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {t('settings.icsLabel')}
              </label>
              <p className="text-[10px] text-slate-400 mt-0.5 mb-2">{t('settings.icsHelp')}</p>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={icsUrl}
                  onChange={(e) => {
                    setIcsUrl(e.target.value);
                    setTestResult(null);
                  }}
                  placeholder={t('settings.icsPlaceholder')}
                  className="flex-grow border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-900 dark:text-white"
                />
                <button
                  onClick={handleTestUrl}
                  disabled={isTesting || !icsUrl.trim()}
                  className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 shrink-0"
                >
                  {isTesting ? <Loader2 size={14} className="animate-spin" /> : t('common.test')}
                </button>
              </div>
              {testResult === 'valid' && (
                <p className="text-xs text-emerald-600 font-bold mt-1.5 flex items-center gap-1">
                  <CheckCircle2 size={12} /> {t('settings.feedVerified')}
                </p>
              )}
              {testResult === 'invalid' && (
                <p className="text-xs text-red-500 font-bold mt-1.5 flex items-center gap-1">
                  <AlertCircle size={12} /> {t('settings.feedInvalid')}
                </p>
              )}
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
              <div>
                {currentIcsUrl && (
                  <button
                    onClick={handleRemoveIcs}
                    disabled={isSavingIcs}
                    className="text-xs font-bold text-red-500 hover:text-red-700 disabled:opacity-50"
                  >
                    {t('settings.removeFeed')}
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCancelEdit}
                  className="flex items-center gap-1 px-3 py-1.5 text-slate-500 dark:text-slate-400 text-xs font-bold rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  <X size={12} /> {t('common.cancel')}
                </button>
                <button
                  onClick={handleSaveIcs}
                  disabled={isSavingIcs || !icsUrl.trim()}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-lg disabled:opacity-50"
                >
                  {isSavingIcs ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                  {t('settings.saveFeed')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Accounts ── */}
      {onSaveAccount && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none p-5">
          <AccountManager
            accounts={accounts}
            onSave={onSaveAccount}
            onDelete={onDeleteAccount}
            isSaving={isAccountSaving}
          />
        </div>
      )}

      {/* ── Payment Instructions ── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-none p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-slate-50 dark:bg-slate-800 rounded-xl">
            <CreditCard size={16} className="text-slate-500" />
          </div>
          <div>
            <p className="text-sm font-black text-slate-800 dark:text-white">{t('settings.paymentInstructions')}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{t('settings.paymentHelp')}</p>
          </div>
        </div>
        <textarea
          value={paymentInfo}
          onChange={(e) => setPaymentInfo(e.target.value)}
          rows={5}
          placeholder={t('settings.paymentPlaceholder')}
          className="w-full border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-none text-slate-700 dark:text-slate-300 dark:bg-slate-800"
        />
        <div className="flex justify-end">
          <button
            onClick={handleSavePayment}
            disabled={isSavingPayment}
            className="flex items-center gap-1.5 px-5 py-2 bg-slate-900 dark:bg-slate-100 hover:bg-slate-700 dark:hover:bg-slate-200 text-white dark:text-slate-900 text-xs font-black rounded-xl disabled:opacity-50 transition-colors"
          >
            {isSavingPayment ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            {t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
