import { useEffect, useState } from 'react';
import { Loader2, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import AdminCard from './layout/AdminCard';
import { useT } from '../i18n/I18nContext';
import { chatService } from '../services/chatService';

const POLICIES = ['everyone', 'staff', 'none'];

/**
 * Who may start private and group chats on the team. The team chat itself is always on; this decides whether
 * people can open conversations beside it. Saved by the team's manager, the club's admins or a super admin
 * (chat_set_policy checks); anyone else sees the setting and a refusal if they try.
 */
export default function ChatSettingsCard({ teamId, showToast }) {
  const { t } = useT();
  const [saved, setSaved] = useState(null);
  const [choice, setChoice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setSaved(null);
    setChoice(null);
    if (!teamId) return undefined;
    chatService.getStartPolicy(teamId).then(
      (p) => {
        if (!live) return;
        setSaved(p);
        setChoice(p);
      },
      () => live && setSaved('everyone'),
    );
    return () => {
      live = false;
    };
  }, [teamId]);

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await chatService.setStartPolicy(teamId, choice);
      setSaved(choice);
      showToast?.(t('settings.chatSaved'));
    } catch (err) {
      setError(err?.code === '42501' ? t('settings.chatNotAllowed') : err?.message || t('settings.chatFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminCard
      title={t('settings.chat')}
      icon={MessageCircle}
      bodyClassName="space-y-3"
      footer={
        <div className="flex justify-end">
          <button
            type="button"
            onClick={save}
            disabled={busy || !choice || choice === saved}
            className="inline-flex min-h-9 items-center gap-2 rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground disabled:opacity-50"
          >
            {busy && <Loader2 size={13} className="animate-spin" />}
            {t('common.save')}
          </button>
        </div>
      }
    >
      <p className="text-xs text-muted-foreground">{t('settings.chatHelp')}</p>
      {saved === null ? (
        <Loader2 size={16} className="animate-spin text-muted-foreground" />
      ) : (
        <div role="radiogroup" aria-label={t('settings.chatWhoStarts')} className="space-y-2">
          {POLICIES.map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={choice === p}
              onClick={() => setChoice(p)}
              className={cn(
                'block w-full rounded-lg border p-3 text-left transition-colors',
                choice === p ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-muted',
              )}
            >
              <span className="block text-sm font-semibold text-foreground">{t(`settings.chatPolicy_${p}`)}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{t(`settings.chatPolicy_${p}Body`)}</span>
            </button>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </AdminCard>
  );
}
