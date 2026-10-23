import { useState } from 'react';
import { CalendarCog, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import AdminCard from './layout/AdminCard';
import { useT } from '../i18n/I18nContext';

/**
 * Who runs the team's schedule: a calendar feed (TeamSnap, Google, GotSport…) the app reads, the app itself
 * (staff add games and practices, practices repeat, families RSVP and subscribe to the app's link), or both: the
 * feed's events plus the team's own. Switching takes a second, confirming tap that says what will happen to the
 * events already there.
 */
export default function ScheduleSourceCard({ source = 'feed', hasFeed = false, onChange }) {
  const { t } = useT();
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const options = [
    { id: 'feed', title: t('settings.scheduleSourceFeed'), body: t('settings.scheduleSourceFeedBody') },
    { id: 'app', title: t('settings.scheduleSourceApp'), body: t('settings.scheduleSourceAppBody') },
    { id: 'hybrid', title: t('settings.scheduleSourceHybrid'), body: t('settings.scheduleSourceHybridBody') },
  ];
  const consequence = {
    app: hasFeed ? t('settings.scheduleSourceToAppImport') : t('settings.scheduleSourceToAppEmpty'),
    feed: t('settings.scheduleSourceToFeed'),
    hybrid: hasFeed ? t('settings.scheduleSourceToHybrid') : t('settings.scheduleSourceToHybridNoFeed'),
  };
  const switchLabel = {
    app: t('settings.scheduleSourceSwitchApp'),
    feed: t('settings.scheduleSourceSwitchFeed'),
    hybrid: t('settings.scheduleSourceSwitchHybrid'),
  };

  const confirm = async () => {
    setBusy(true);
    setError('');
    try {
      await onChange(pending);
      setPending(null);
    } catch (err) {
      setError(err?.message || t('settings.scheduleSourceFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminCard title={t('settings.scheduleSource')} icon={CalendarCog} bodyClassName="space-y-3">
      <div role="radiogroup" aria-label={t('settings.scheduleSource')} className="grid gap-2 sm:grid-cols-3">
        {options.map((o) => {
          const current = source === o.id;
          const chosen = (pending ?? source) === o.id;
          return (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={chosen}
              disabled={!onChange || busy}
              onClick={() => setPending(current ? null : o.id)}
              className={cn(
                'rounded-lg border p-3 text-left transition-colors disabled:opacity-60',
                chosen ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-muted',
              )}
            >
              <span className="flex items-center justify-between gap-2 text-sm font-semibold text-foreground">
                {o.title}
                {current && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {t('settings.scheduleSourceCurrent')}
                  </span>
                )}
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{o.body}</span>
            </button>
          );
        })}
      </div>

      {pending && pending !== source && (
        <div className="space-y-3 rounded-lg border border-border bg-muted/50 p-3">
          <p className="text-sm text-foreground">{consequence[pending]}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={confirm}
              disabled={busy}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              {busy && <Loader2 size={14} className="animate-spin" />}
              {switchLabel[pending]}
            </button>
            <button
              type="button"
              onClick={() => setPending(null)}
              disabled={busy}
              className="min-h-10 rounded-lg px-3 text-sm font-semibold text-muted-foreground hover:bg-muted"
            >
              {t('common.cancel')}
            </button>
          </div>
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
