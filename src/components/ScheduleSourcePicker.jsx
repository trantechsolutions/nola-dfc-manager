import { cn } from '@/lib/utils';
import { useT } from '../i18n/I18nContext';

export const SCHEDULE_SOURCES = ['feed', 'app', 'hybrid'];

/**
 * Choosing who runs a new team's schedule: a calendar feed, this app, or both. A plain choice, for team setup;
 * changing it later goes through Team Settings (ScheduleSourceCard), which says what happens to the events
 * already there.
 */
export default function ScheduleSourcePicker({ value = 'feed', onChange, className }) {
  const { t } = useT();
  const label = { feed: 'scheduleSourceFeed', app: 'scheduleSourceApp', hybrid: 'scheduleSourceHybrid' };
  return (
    <div role="radiogroup" aria-label={t('settings.scheduleSource')} className={cn('grid gap-2', className)}>
      {SCHEDULE_SOURCES.map((id) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          onClick={() => onChange(id)}
          className={cn(
            'rounded-lg border p-3 text-left transition-colors',
            value === id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:bg-muted',
          )}
        >
          <span className="block text-sm font-semibold text-foreground">{t(`settings.${label[id]}`)}</span>
          <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
            {t(`settings.${label[id]}Body`)}
          </span>
        </button>
      ))}
    </div>
  );
}
