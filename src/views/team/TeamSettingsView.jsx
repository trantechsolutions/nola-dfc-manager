import { useState, useEffect, useRef } from 'react';
import {
  Rss,
  CreditCard,
  Link2,
  CheckCircle2,
  AlertCircle,
  Save,
  Loader2,
  Eye,
  Layers,
  Wallet,
  Trash2,
} from 'lucide-react';
import { supabaseService } from '../../services/supabaseService';
import { useT } from '../../i18n/I18nContext';
import AccountManager from '../../components/AccountManager';
import PaymentInstructionsText from '../../components/PaymentInstructionsText';
import ViewScopeCard from '../../components/ViewScopeCard';
import AdminCard from '../../components/layout/AdminCard';
import FormRow from '../../components/layout/FormRow';
import { formControl } from '../../components/layout/formControl';
import SettingsShell from '../../components/layout/SettingsShell';
import { PAYMENT_TOKENS, buildPreviewTokens } from '../../utils/paymentTemplate';

export default function TeamSettingsView({
  selectedTeam,
  refreshContext,
  showToast,
  accounts = [],
  onSaveAccount,
  onDeleteAccount,
  isAccountSaving = false,
  viewScope,
  onChangeViewScope,
  canSetViewScope = false,
}) {
  const { t } = useT();

  // ── iCal state ──
  // The feed URL is edited in place (AdminLTE settings forms have no view/edit
  // mode — the card footer owns the commit), so this mirrors the team record
  // and re-syncs whenever the selected team changes.
  const [icsUrl, setIcsUrl] = useState(selectedTeam?.icalUrl || '');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [isSavingIcs, setIsSavingIcs] = useState(false);

  useEffect(() => {
    setIcsUrl(selectedTeam?.icalUrl || '');
    setTestResult(null);
  }, [selectedTeam?.id]);

  // ── Payment info state ──
  const [paymentInfo, setPaymentInfo] = useState(selectedTeam?.paymentInfo || '');
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const paymentRef = useRef(null);

  useEffect(() => {
    setPaymentInfo(selectedTeam?.paymentInfo || '');
  }, [selectedTeam?.id]);

  // ── ReePlayer links state ──
  const [reeplayerPlayerLink, setReeplayerPlayerLink] = useState(selectedTeam?.reeplayerPlayerLink || '');
  const [reeplayerFanLink, setReeplayerFanLink] = useState(selectedTeam?.reeplayerFanLink || '');
  const [isSavingReeplayer, setIsSavingReeplayer] = useState(false);

  useEffect(() => {
    setReeplayerPlayerLink(selectedTeam?.reeplayerPlayerLink || '');
    setReeplayerFanLink(selectedTeam?.reeplayerFanLink || '');
  }, [selectedTeam?.id]);

  const currentIcsUrl = selectedTeam?.icalUrl || '';

  // ── iCal handlers ──
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

  // ── ReePlayer links handler ──
  const handleSaveReeplayer = async () => {
    if (!selectedTeam?.id) return;
    setIsSavingReeplayer(true);
    try {
      await supabaseService.updateTeam(selectedTeam.id, {
        reeplayerPlayerLink: reeplayerPlayerLink.trim(),
        reeplayerFanLink: reeplayerFanLink.trim(),
      });
      if (refreshContext) await refreshContext();
      if (showToast) showToast('ReePlayer links saved.');
    } catch (err) {
      if (showToast) showToast(`Failed: ${err.message}`, true);
    } finally {
      setIsSavingReeplayer(false);
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

  // Drops a merge token at the caret so staff never has to type the braces.
  const insertPaymentToken = (token) => {
    const el = paymentRef.current;
    const snippet = `{${token}}`;
    if (!el) {
      setPaymentInfo((prev) => prev + snippet);
      return;
    }
    const start = el.selectionStart ?? paymentInfo.length;
    const end = el.selectionEnd ?? start;
    const next = paymentInfo.slice(0, start) + snippet + paymentInfo.slice(end);
    setPaymentInfo(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + snippet.length, start + snippet.length);
    });
  };

  const previewTokens = buildPreviewTokens({ teamName: selectedTeam?.name || '' });

  // The view-scope pane is the only way back once "Team only" has hidden Club →
  // Settings, so it leads the rail when the current user can set it.
  const sections = [
    ...(canSetViewScope && onChangeViewScope
      ? [{ id: 'view', label: t('settings.viewScope', 'View Scope'), icon: Layers }]
      : []),
    { id: 'calendar', label: t('settings.calendarFeed'), icon: Rss },
    ...(onSaveAccount ? [{ id: 'accounts', label: t('settings.sectionAccounts', 'Accounts'), icon: Wallet }] : []),
    { id: 'payments', label: t('settings.paymentInstructions'), icon: CreditCard },
    { id: 'links', label: t('settings.reeplayerLinks'), icon: Link2 },
  ];

  const [section, setSection] = useState(sections[0]?.id || 'calendar');

  return (
    <div className="pb-24 md:pb-0">
      <p className="mb-4 text-xs font-semibold text-muted-foreground">{selectedTeam?.name}</p>

      <SettingsShell sections={sections} active={section} onChange={setSection}>
        {section === 'view' && <ViewScopeCard viewScope={viewScope} onChange={onChangeViewScope} />}

        {section === 'calendar' && (
          <AdminCard
            title={t('settings.calendarFeed')}
            icon={Rss}
            footer={
              <div className="flex flex-wrap items-center justify-between gap-2">
                {currentIcsUrl ? (
                  <button
                    onClick={handleRemoveIcs}
                    disabled={isSavingIcs}
                    className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
                  >
                    <Trash2 size={13} /> {t('settings.removeFeed')}
                  </button>
                ) : (
                  <span />
                )}
                <div className="flex gap-2">
                  <button
                    onClick={handleTestUrl}
                    disabled={isTesting || !icsUrl.trim()}
                    className="flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
                  >
                    {isTesting ? <Loader2 size={13} className="animate-spin" /> : null}
                    {t('common.test')}
                  </button>
                  <SaveButton onClick={handleSaveIcs} busy={isSavingIcs} disabled={icsUrl.trim() === currentIcsUrl}>
                    {t('settings.saveFeed')}
                  </SaveButton>
                </div>
              </div>
            }
            bodyClassName="space-y-4"
          >
            <StatusLine ok={Boolean(currentIcsUrl)} okText={currentIcsUrl} warnText={t('settings.noFeed')} />
            <FormRow label={t('settings.icsLabel')} htmlFor="ics-url" help={t('settings.icsHelp')}>
              <input
                id="ics-url"
                type="url"
                value={icsUrl}
                onChange={(e) => {
                  setIcsUrl(e.target.value);
                  setTestResult(null);
                }}
                placeholder={t('settings.icsPlaceholder')}
                className={formControl}
              />
              {testResult === 'valid' && (
                <p className="flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 size={12} /> {t('settings.feedVerified')}
                </p>
              )}
              {testResult === 'invalid' && (
                <p className="flex items-center gap-1 text-xs font-semibold text-destructive">
                  <AlertCircle size={12} /> {t('settings.feedInvalid')}
                </p>
              )}
            </FormRow>
          </AdminCard>
        )}

        {/* AccountManager supplies its own AdminCard so it shares the box, the
            title bar and the footer rule with every other pane here. */}
        {section === 'accounts' && onSaveAccount && (
          <AccountManager
            accounts={accounts}
            onSave={onSaveAccount}
            onDelete={onDeleteAccount}
            isSaving={isAccountSaving}
          />
        )}

        {section === 'payments' && (
          <AdminCard
            title={t('settings.paymentInstructions')}
            icon={CreditCard}
            footer={
              <div className="flex justify-end">
                <SaveButton onClick={handleSavePayment} busy={isSavingPayment}>
                  {t('common.save')}
                </SaveButton>
              </div>
            }
            bodyClassName="space-y-4"
          >
            <FormRow label={t('settings.paymentInstructions')} htmlFor="payment-info" help={t('settings.paymentHelp')}>
              <textarea
                id="payment-info"
                ref={paymentRef}
                value={paymentInfo}
                onChange={(e) => setPaymentInfo(e.target.value)}
                rows={5}
                placeholder={t('settings.paymentPlaceholder')}
                className={`${formControl} resize-none`}
              />
            </FormRow>

            {/* Merge tokens — resolved per family when the instructions are shown */}
            <FormRow label={t('settings.paymentTokens')} help={t('settings.paymentMathHelp')}>
              <p className="text-xs text-muted-foreground">{t('settings.paymentTokensHelp')}</p>
              <div className="flex flex-wrap gap-1.5">
                {PAYMENT_TOKENS.map(({ token }) => (
                  <button
                    key={token}
                    type="button"
                    onClick={() => insertPaymentToken(token)}
                    title={t(`settings.paymentToken_${token}`)}
                    className="rounded-md border border-border bg-background px-2 py-1 font-mono text-xs font-semibold text-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
                  >
                    {`{${token}}`}
                  </button>
                ))}
              </div>
            </FormRow>

            {/* Live preview against sample numbers */}
            {paymentInfo.trim() && (
              <FormRow label={t('settings.paymentPreview')}>
                <div className="flex gap-2 rounded-lg border border-border bg-background p-3">
                  <Eye size={12} className="mt-0.5 shrink-0 text-muted-foreground" />
                  <PaymentInstructionsText
                    template={paymentInfo}
                    tokens={previewTokens}
                    className="text-xs text-foreground"
                  />
                </div>
              </FormRow>
            )}
          </AdminCard>
        )}

        {section === 'links' && (
          <AdminCard
            title={t('settings.reeplayerLinks')}
            icon={Link2}
            footer={
              <div className="flex justify-end">
                <SaveButton onClick={handleSaveReeplayer} busy={isSavingReeplayer}>
                  {t('common.save')}
                </SaveButton>
              </div>
            }
            bodyClassName="space-y-4"
          >
            <p className="text-xs text-muted-foreground">{t('settings.reeplayerLinksHelp')}</p>
            <FormRow
              label={t('settings.reeplayerPlayerLink')}
              htmlFor="reeplayer-player"
              help={t('settings.reeplayerPlayerLinkHelp')}
            >
              <input
                id="reeplayer-player"
                type="url"
                value={reeplayerPlayerLink}
                onChange={(e) => setReeplayerPlayerLink(e.target.value)}
                placeholder={t('settings.reeplayerPlayerLinkPlaceholder')}
                className={formControl}
              />
            </FormRow>
            <FormRow
              label={t('settings.reeplayerFanLink')}
              htmlFor="reeplayer-fan"
              help={t('settings.reeplayerFanLinkHelp')}
            >
              <input
                id="reeplayer-fan"
                type="url"
                value={reeplayerFanLink}
                onChange={(e) => setReeplayerFanLink(e.target.value)}
                placeholder={t('settings.reeplayerFanLinkPlaceholder')}
                className={formControl}
              />
            </FormRow>
          </AdminCard>
        )}
      </SettingsShell>
    </div>
  );
}

/** AdminLTE puts the primary action alone in the `.card-footer`. */
function SaveButton({ onClick, busy, disabled, children }) {
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
    >
      {busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
      {children}
    </button>
  );
}

/** Configured/not-configured line that used to sit under the card title. */
function StatusLine({ ok, okText, warnText }) {
  if (!ok) {
    return (
      <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
        <AlertCircle size={12} /> {warnText}
      </p>
    );
  }
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <CheckCircle2 size={12} className="shrink-0 text-emerald-700 dark:text-emerald-400" />
      <span className="truncate font-medium">{okText}</span>
    </p>
  );
}
