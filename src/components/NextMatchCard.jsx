import { CalendarDays, CalendarPlus, Clock, MapPin } from 'lucide-react';
import { useT } from '../i18n/I18nContext';
import { useNavigation } from '../context/NavigationContext';
import { useScheduleContext } from '../context/ScheduleContext';
import { downloadEventIcs } from '../utils/ics';
import { useRsvpPropsFor } from '../hooks/useEventRsvps';
import EventRsvp from './EventRsvp';

const AFTER_THAT = 3;

/**
 * NextMatchCard — the first thing on Home, for parents and staff alike.
 *
 * "When and where is the next one?" is the question almost every visit to
 * the app starts with, so the answer is the one loud element on the screen:
 * filled with the team's colour, with the date set large like a matchday
 * ticket. The events after it follow as a quiet list, and everything else on
 * Home sits beneath.
 */
export default function NextMatchCard() {
  const { events, scheduleLoading } = useScheduleContext();
  const { navigate, teams = [], selectedTeamId } = useNavigation();
  const teamName = (teams.find((team) => team.id === selectedTeamId) || teams[0])?.name;
  const { t, locale } = useT();
  const rsvpFor = useRsvpPropsFor();

  const upcoming = events?.upcoming || [];
  const next = upcoming[0];
  const later = upcoming.slice(1, 1 + AFTER_THAT);

  // "Nothing scheduled" is only true once the feed has answered; before that
  // the card holds its shape so Home does not jump when the data lands.
  if (!next && scheduleLoading) {
    return (
      <section
        aria-busy="true"
        aria-label={t('nav.nextUp')}
        className="h-48 animate-pulse rounded-lg border border-border bg-muted motion-reduce:animate-none sm:h-56"
      />
    );
  }

  if (!next) {
    return (
      <section className="rounded-lg border border-border bg-card p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-foreground">{t('nav.nothingScheduled')}</h2>
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted-foreground">
          {t('nav.nothingScheduledHint')}
        </p>
        <button
          type="button"
          onClick={() => navigate('/schedule')}
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          <CalendarDays size={16} />
          {t('nav.openSchedule')}
        </button>
      </section>
    );
  }

  const when = new Date(next.timestamp * 1000);
  const hasPlace = next.location && next.location !== 'TBD';
  const nextRsvp = next.isCancelled ? null : rsvpFor(next);

  return (
    <div className="space-y-3">
      <section
        aria-labelledby="next-match-title"
        className="relative overflow-hidden rounded-lg"
        // The edge only shows when the team colour matches the page (a white
        // or cream kit); otherwise it is the fill itself and disappears.
        style={{
          backgroundColor: 'var(--team)',
          color: 'var(--team-foreground)',
          boxShadow: 'inset 0 0 0 1px var(--team-edge)',
        }}
      >
        <PitchMarkings />

        <div className="relative grid gap-5 p-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-8 sm:p-8">
          <div className="flex items-baseline gap-3 sm:block">
            <p className="text-sm font-medium opacity-80">{relativeDay(when, locale, t)}</p>
            <p className="font-numeral text-6xl font-bold leading-none tabular-nums sm:mt-1 sm:text-8xl">
              {when.getDate()}
            </p>
            <p className="text-sm font-semibold sm:mt-1">{when.toLocaleDateString(locale, { month: 'long' })}</p>
          </div>

          <div className="min-w-0">
            <p className="text-sm font-medium opacity-80">
              {t('nav.nextUp')}
              {next.eventType && next.eventType !== 'event'
                ? `, ${t(`eventTypes.${next.eventType}`, next.eventType).toLowerCase()}`
                : ''}
            </p>
            <h2 id="next-match-title" className="mt-1 text-2xl font-bold leading-tight tracking-tight sm:text-3xl">
              {next.title}
            </h2>

            <dl className="mt-4 space-y-1.5 text-sm">
              <div className="flex items-center gap-2">
                <dt className="sr-only">Time</dt>
                <Clock size={15} className="shrink-0 opacity-80" aria-hidden="true" />
                <dd className="font-medium">{next.displayTime}</dd>
              </div>
              <div className="flex items-start gap-2">
                <dt className="sr-only">Place</dt>
                <MapPin size={15} className="mt-0.5 shrink-0 opacity-80" aria-hidden="true" />
                <dd className="font-medium leading-snug">{next.location || 'TBD'}</dd>
              </div>
            </dl>

            <div className="mt-5 flex flex-wrap gap-2">
              {hasPlace && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(next.location)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-semibold"
                  style={{ backgroundColor: 'var(--team-foreground)', color: 'var(--team)' }}
                >
                  <MapPin size={16} aria-hidden="true" />
                  {t('nav.directions')}
                </a>
              )}
              <button
                type="button"
                onClick={() => downloadEventIcs(next, { teamName })}
                className="inline-flex items-center gap-2 rounded-md border border-current px-4 py-2.5 text-sm font-semibold"
              >
                <CalendarPlus size={16} aria-hidden="true" />
                {t('nav.addToCalendar')}
              </button>
              <button
                type="button"
                onClick={() => navigate('/schedule')}
                className="inline-flex items-center gap-2 rounded-md px-2 py-2.5 text-sm font-semibold underline-offset-4 hover:underline"
              >
                {t('nav.fullSchedule')}
              </button>
            </div>
          </div>
        </div>

        {/* Who's coming, on the card itself: a guardian answers here without opening the schedule. A light band,
            so the green, orange and red read on any team colour. */}
        {nextRsvp && (
          <div className="relative border-t border-border bg-card px-5 py-3 text-foreground sm:px-8">
            {/* Staff get the same roster as the schedule: tap the totals to answer for any player. */}
            <EventRsvp {...nextRsvp} className="" />
          </div>
        )}
      </section>

      {later.length > 0 && (
        <section aria-label={t('nav.afterThat')} className="m-bleed rounded-lg border border-border bg-card">
          <h3 className="px-4 pt-3 text-sm font-semibold text-muted-foreground">{t('nav.afterThat')}</h3>
          <ul className="divide-y divide-border">
            {later.map((event) => {
              const date = new Date(event.timestamp * 1000);
              const rsvp = event.isCancelled ? null : rsvpFor(event);
              return (
                <li key={event.id} className="flex items-center gap-4 px-4 py-3">
                  <span className="w-14 shrink-0 text-center">
                    <span className="block text-xs text-muted-foreground">
                      {date.toLocaleDateString(locale, { weekday: 'short' })}
                    </span>
                    <span className="block font-numeral text-2xl font-bold leading-tight tabular-nums text-foreground">
                      {date.getDate()}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-foreground">{event.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{event.location}</span>
                    {rsvp && <EventRsvp {...rsvp} compact={!rsvp.canManage} className="mt-2" />}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{event.displayTime}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function relativeDay(date, locale, t) {
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(date) - startOf(new Date())) / 86400000);
  if (days === 0) return t('nav.today');
  if (days === 1) return t('nav.tomorrow');
  return date.toLocaleDateString(locale, { weekday: 'long' });
}

/** Halfway line and centre circle, drawn in the card's own ink at low strength. */
function PitchMarkings() {
  return (
    <svg
      className="pointer-events-none absolute -right-16 top-1/2 h-[140%] -translate-y-1/2 opacity-[0.12]"
      viewBox="0 0 200 200"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <line x1="100" y1="0" x2="100" y2="200" />
      <circle cx="100" cy="100" r="54" />
      <circle cx="100" cy="100" r="3" fill="currentColor" />
    </svg>
  );
}
