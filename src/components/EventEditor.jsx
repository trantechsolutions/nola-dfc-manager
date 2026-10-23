import { useContext, useEffect, useMemo, useState } from 'react';
import { Ban, Bell, Repeat, RotateCcw, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ResponsiveModal, FormRow, formControl } from './layout';
import { useT } from '../i18n/I18nContext';
import { scheduleService } from '../services/scheduleService';
import { pushService } from '../services/pushService';
import { EVENT_TYPES } from '../utils/eventClassifier';
import { atLocal, eventRow, expandSeries, isGameType, isoDay, validateEvent } from '../utils/eventSeries';
import { ScheduleContext } from '../context/ScheduleContext';

const TYPE_ORDER = ['practice', 'league', 'friendly', 'tournament', 'event'];

const pad = (n) => String(n).padStart(2, '0');
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** The form for a new event, or for an existing team_events row (from getTeamEvents). */
function initialForm(dbEvent) {
  if (!dbEvent) {
    const today = isoDay(new Date());
    return {
      eventType: 'practice',
      title: '',
      opponent: '',
      isHome: true,
      day: today,
      startTime: '18:00',
      endDay: today,
      endTime: '19:30',
      arrivalTime: '',
      location: '',
      locationDetails: '',
      meetingUrl: '',
      uniform: '',
      notes: '',
      excludeFromStats: false,
    };
  }
  const start = new Date(dbEvent.eventDate);
  const end = dbEvent.endDate ? new Date(dbEvent.endDate) : null;
  return {
    eventType: dbEvent.eventType || 'event',
    title: dbEvent.title || '',
    opponent: dbEvent.opponent || '',
    isHome: dbEvent.isHome ?? null,
    day: isoDay(start),
    startTime: hhmm(start),
    endDay: end ? isoDay(end) : isoDay(start),
    endTime: end ? hhmm(end) : '',
    // Kept as minutes before the start; shown and edited as the clock time to arrive by.
    arrivalTime: dbEvent.arrivalMinutes ? hhmm(new Date(start.getTime() - dbEvent.arrivalMinutes * 60000)) : '',
    location: dbEvent.location && dbEvent.location !== 'TBD' ? dbEvent.location : '',
    locationDetails: dbEvent.locationDetails || '',
    meetingUrl: dbEvent.meetingUrl || '',
    uniform: dbEvent.uniform || '',
    notes: dbEvent.description || '',
    excludeFromStats: !!dbEvent.excludeFromStats,
  };
}

/**
 * Add or change an event on a schedule the app runs: one-off games, practices and events, or a practice that
 * repeats every week. Changing one session of a repeating practice asks whether the change is for that day
 * or for it and every later one. Each save can notify the whole team, or not.
 */
export default function EventEditor({
  open,
  onClose,
  teamId,
  teamName,
  dbEvent = null,
  blackoutDates = [],
  teamEvents = [],
  onSaved,
}) {
  const { t, locale } = useT();
  const isNew = !dbEvent;
  const [form, setForm] = useState(() => initialForm(dbEvent));
  const [repeat, setRepeat] = useState(null); // { weekdays, endsOn, skipBlackouts } when repeating
  const [series, setSeries] = useState(null);
  const [scope, setScope] = useState('one'); // 'one' | 'following', for a session of a series
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState([]);
  const [failure, setFailure] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm(initialForm(dbEvent));
    setRepeat(null);
    setSeries(null);
    setScope('one');
    setNotify(true);
    setErrors([]);
    setFailure('');
    if (dbEvent?.seriesId && !dbEvent.seriesDetached) {
      scheduleService.getSeries(dbEvent.seriesId).then(setSeries, () => setSeries(null));
    }
  }, [open, dbEvent]);

  // Editing "this and later" sessions edits the series' own days and end date too.
  useEffect(() => {
    if (scope === 'following' && series) {
      setRepeat({ weekdays: series.weekdays, endsOn: series.endsOn, skipBlackouts: series.skipBlackouts });
    } else if (!isNew) setRepeat(null);
  }, [scope, series, isNew]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e?.target ? e.target.value : e }));
  // Moving the start date carries a same-day end along with it.
  const setDay = (e) =>
    setForm((f) => ({ ...f, day: e.target.value, endDay: f.endDay === f.day ? e.target.value : f.endDay }));

  // What the team has used before, offered as suggestions while typing: opponents (and the saved opponent
  // contacts), venues and uniforms.
  const schedule = useContext(ScheduleContext);
  const suggest = useMemo(() => {
    const uniq = (list) =>
      [...new Set(list.map((v) => (v || '').trim()).filter((v) => v && v !== 'TBD'))].sort((a, b) =>
        a.localeCompare(b),
      );
    const past = teamEvents.filter((e) => e.teamId === teamId || !e.teamId);
    return {
      // A feed game has no opponent field, only a title ("vs Chelsea", "at Liverpool"): its name is the title
      // without the vs/at. A tournament's title is the tournament, not an opponent.
      opponents: uniq([
        ...past.map(
          (e) =>
            e.opponent ||
            (['league', 'friendly'].includes(e.eventType) ? (e.title || '').replace(/^(vs\.?|@|at)\s+/i, '') : ''),
        ),
        ...(schedule?.opponentContacts || []).map((c) => c.clubName),
      ]),
      locations: uniq(past.map((e) => e.location)),
      uniforms: uniq(past.map((e) => e.uniform)),
    };
  }, [teamEvents, teamId, schedule?.opponentContacts]);
  const game = isGameType(form.eventType);
  const typeLabel = (key) => t(`eventTypes.${key}`, EVENT_TYPES[key]?.label || key);
  const weekdayNames = useMemo(
    () =>
      // Sunday-first, matching Date#getDay (Oct 4 2026 is a Sunday).
      [0, 1, 2, 3, 4, 5, 6].map((d) => new Date(2026, 9, 4 + d).toLocaleDateString(locale, { weekday: 'short' })),
    [locale],
  );

  const preview = useMemo(() => {
    if (!repeat) return null;
    return expandSeries(
      { ...repeat, startTime: form.startTime, endTime: form.endTime, startsOn: series?.startsOn || form.day },
      { blackouts: blackoutDates, skipBlackouts: repeat.skipBlackouts },
    );
  }, [repeat, form.startTime, form.endTime, form.day, series?.startsOn, blackoutDates]);

  const when = (day, time) =>
    atLocal(day, time).toLocaleString(locale, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });

  // One push to everyone on the team, if the box is ticked. A failed push never undoes the change.
  const tell = async (title, body) => {
    if (!notify) return;
    try {
      await pushService.broadcast({ teamId, title, body, url: '/schedule' });
    } catch (err) {
      console.warn('[schedule] notify failed:', err?.message);
    }
  };

  const run = async (work) => {
    setBusy(true);
    setFailure('');
    try {
      await work();
      await onSaved?.();
      onClose();
    } catch (err) {
      setFailure(err?.message || t('schedule.editor.saveFailed'));
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // A practice or event with no name is called by its type ("Practice"); a game by its opponent.
    const named = { ...form, title: form.title.trim() || (game ? '' : typeLabel(form.eventType)) };
    const found = validateEvent(named, { repeat });
    if (repeat && preview && !preview.sessions.length) found.push('noSessions');
    setErrors(found);
    if (found.length) return;
    const row = eventRow(named);
    const where = row.location ? ` · ${row.location}` : '';

    run(async () => {
      if (isNew && repeat) {
        const s = { ...repeat, startTime: form.startTime, endTime: form.endTime, startsOn: form.day };
        await scheduleService.createSeries(teamId, s, preview.sessions, row);
        await tell(
          t('schedule.editor.notifyAddedSeriesTitle', { team: teamName }),
          t('schedule.editor.notifyAddedSeriesBody', {
            n: preview.sessions.length,
            title: row.title,
            from: when(form.day, form.startTime),
          }),
        );
      } else if (isNew) {
        await scheduleService.createEvent(teamId, row);
        await tell(
          t('schedule.editor.notifyAddedTitle', { team: teamName, type: typeLabel(form.eventType) }),
          `${row.title} · ${when(form.day, form.startTime)}${where}`,
        );
      } else if (scope === 'following' && series) {
        const s = {
          ...repeat,
          startTime: form.startTime,
          endTime: form.endTime,
          startsOn: series.startsOn,
        };
        await scheduleService.updateSeries(teamId, series.id, s, preview.sessions, row, form.day);
        await tell(
          t('schedule.editor.notifyChangedTitle', { team: teamName }),
          t('schedule.editor.notifyChangedSeriesBody', { title: row.title, from: when(form.day, form.startTime) }),
        );
      } else {
        await scheduleService.updateEvent(dbEvent.id, row, { detach: !!dbEvent.seriesId });
        await tell(
          t('schedule.editor.notifyChangedTitle', { team: teamName }),
          `${row.title} · ${when(form.day, form.startTime)}${where}`,
        );
      }
    });
  };

  const handleCancelToggle = () =>
    run(async () => {
      const cancelling = !dbEvent.isCancelled;
      await scheduleService.setEventCancelled(dbEvent.id, cancelling);
      await tell(
        cancelling
          ? t('schedule.editor.notifyCancelledTitle', { team: teamName })
          : t('schedule.editor.notifyRestoredTitle', { team: teamName }),
        `${dbEvent.title} · ${when(form.day, form.startTime)}`,
      );
    });

  const handleDelete = () =>
    run(async () => {
      if (scope === 'following' && series) {
        await scheduleService.endSeries(series.id, form.day);
      } else {
        const deleted = await scheduleService.deleteEvent(dbEvent.id);
        // Money hangs off it (an expense or a budget push): it stays, cancelled.
        if (!deleted) await scheduleService.setEventCancelled(dbEvent.id, true);
      }
      await tell(
        t('schedule.editor.notifyCancelledTitle', { team: teamName }),
        `${dbEvent.title} · ${when(form.day, form.startTime)}`,
      );
    });

  const pill = (on) =>
    cn(
      'min-h-10 rounded-full border px-3.5 text-sm font-semibold transition-colors',
      on
        ? 'border-foreground bg-foreground text-background'
        : 'border-border bg-card text-muted-foreground hover:text-foreground',
    );

  const inSeries = !isNew && !!series;

  return (
    <ResponsiveModal open={open} onClose={onClose} as="form" onSubmit={handleSubmit} size="lg">
      <ResponsiveModal.Header className="border-b border-border">
        <h2 className="text-lg font-bold text-foreground">
          {isNew ? t('schedule.editor.newTitle') : t('schedule.editor.editTitle')}
        </h2>
        {!isNew && dbEvent.isCancelled && (
          <p className="text-sm font-semibold text-destructive">{t('schedule.editor.isCancelled')}</p>
        )}
      </ResponsiveModal.Header>

      <ResponsiveModal.Body className="space-y-4">
        {inSeries && (
          <fieldset className="rounded-lg border border-border p-3">
            <legend className="px-1 text-sm font-semibold text-foreground">{t('schedule.editor.scopeLegend')}</legend>
            <div className="flex flex-wrap gap-2">
              {['one', 'following'].map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={scope === s}
                  onClick={() => setScope(s)}
                  className={pill(scope === s)}
                >
                  {t(`schedule.editor.scope_${s}`)}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <FormRow label={t('schedule.editor.type')}>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('schedule.editor.type')}>
            {TYPE_ORDER.map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={form.eventType === key}
                onClick={() => set('eventType')(key)}
                className={pill(form.eventType === key)}
              >
                {typeLabel(key)}
              </button>
            ))}
          </div>
        </FormRow>

        {game && (
          <>
            <FormRow label={t('schedule.editor.opponent')} htmlFor="ev-opponent">
              <input
                id="ev-opponent"
                list="ev-opponents"
                autoComplete="off"
                value={form.opponent}
                onChange={set('opponent')}
                placeholder={t('schedule.editor.opponentPlaceholder')}
                className={formControl}
              />
              <datalist id="ev-opponents">
                {suggest.opponents.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </FormRow>
            <FormRow label={t('schedule.editor.venue')}>
              <div className="flex gap-2" role="group" aria-label={t('schedule.editor.venue')}>
                {[
                  [true, 'home'],
                  [false, 'away'],
                ].map(([v, k]) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={form.isHome === v}
                    onClick={() => set('isHome')(form.isHome === v ? null : v)}
                    className={pill(form.isHome === v)}
                  >
                    {t(`schedule.editor.${k}`)}
                  </button>
                ))}
              </div>
            </FormRow>
          </>
        )}

        <FormRow
          label={t('schedule.editor.name')}
          htmlFor="ev-title"
          help={game ? t('schedule.editor.nameGameHelp') : undefined}
        >
          <input
            id="ev-title"
            value={form.title}
            onChange={set('title')}
            placeholder={game ? '' : typeLabel(form.eventType)}
            className={formControl}
          />
        </FormRow>

        <h3 className="border-b border-border pb-1 pt-2 text-sm font-semibold text-muted-foreground">
          {t('schedule.editor.sectionWhen')}
        </h3>

        <FormRow
          label={inSeries && scope === 'following' ? t('schedule.editor.fromDate') : t('schedule.editor.starts')}
        >
          <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-2">
            <input
              id="ev-day"
              type="date"
              aria-label={t('schedule.editor.date')}
              value={form.day}
              onChange={setDay}
              className={formControl}
              required
            />
            <input
              type="time"
              aria-label={t('schedule.editor.time')}
              value={form.startTime}
              onChange={set('startTime')}
              className={formControl}
              required
            />
          </div>
        </FormRow>

        <FormRow label={t('schedule.editor.arrive')} htmlFor="ev-arrive" help={t('schedule.editor.arriveHelp')}>
          <div className="flex items-center gap-2">
            <input
              id="ev-arrive"
              type="time"
              value={form.arrivalTime}
              onChange={set('arrivalTime')}
              className={formControl}
            />
            {form.arrivalTime && (
              <button
                type="button"
                onClick={() => set('arrivalTime')('')}
                aria-label={t('schedule.editor.arriveClear')}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-muted"
              >
                <X size={16} />
              </button>
            )}
          </div>
        </FormRow>

        <FormRow label={t('schedule.editor.ends')}>
          <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-2">
            {/* A repeating practice ends the day it starts; a one-off event can run over days (a tournament). */}
            {repeat ? (
              <span className="flex items-center text-sm text-muted-foreground">{t('schedule.editor.sameDay')}</span>
            ) : (
              <input
                type="date"
                aria-label={t('schedule.editor.endDate')}
                value={form.endDay}
                min={form.day}
                onChange={set('endDay')}
                className={formControl}
              />
            )}
            <input
              type="time"
              aria-label={t('schedule.editor.endTime')}
              value={form.endTime}
              onChange={set('endTime')}
              className={formControl}
            />
          </div>
        </FormRow>

        {/* Repeating: offered on a new event, and when changing a series from a session on. */}
        {(isNew || (inSeries && scope === 'following')) && (
          <div className="rounded-lg border border-border p-3">
            {isNew && (
              <label className="flex min-h-10 items-center gap-2 text-sm font-semibold text-foreground">
                <input
                  type="checkbox"
                  checked={!!repeat}
                  onChange={(e) =>
                    setRepeat(
                      e.target.checked
                        ? { weekdays: [atLocal(form.day).getDay()], endsOn: '', skipBlackouts: true }
                        : null,
                    )
                  }
                  className="h-4 w-4"
                />
                <Repeat size={15} aria-hidden="true" />
                {t('schedule.editor.repeatWeekly')}
              </label>
            )}
            {repeat && (
              <div className="mt-2 space-y-3">
                <div className="grid grid-cols-7 gap-1" role="group" aria-label={t('schedule.editor.repeatOn')}>
                  {weekdayNames.map((name, d) => {
                    const on = repeat.weekdays.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setRepeat((r) => ({
                            ...r,
                            weekdays: on ? r.weekdays.filter((x) => x !== d) : [...r.weekdays, d].sort(),
                          }))
                        }
                        className={cn(pill(on), 'min-w-0 px-0 text-xs')}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
                <label className="block space-y-1 text-xs text-muted-foreground">
                  {t('schedule.editor.repeatUntil')}
                  <input
                    type="date"
                    value={repeat.endsOn}
                    min={form.day}
                    onChange={(e) => setRepeat((r) => ({ ...r, endsOn: e.target.value }))}
                    className={formControl}
                  />
                </label>
                <label className="flex min-h-10 items-center gap-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={repeat.skipBlackouts}
                    onChange={(e) => setRepeat((r) => ({ ...r, skipBlackouts: e.target.checked }))}
                    className="h-4 w-4"
                  />
                  {t('schedule.editor.skipBlackouts')}
                </label>
                {preview && repeat.endsOn && (
                  <p className="text-sm text-muted-foreground" role="status">
                    {t('schedule.editor.repeatPreview', { n: preview.sessions.length })}
                    {preview.skipped.length > 0 &&
                      ` ${t('schedule.editor.repeatSkipped', { n: preview.skipped.length })}`}
                    {preview.capped && ` ${t('schedule.editor.repeatCapped')}`}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <FormRow label={t('schedule.editor.uniform')} htmlFor="ev-uniform" help={t('schedule.editor.uniformHelp')}>
          <input
            id="ev-uniform"
            list="ev-uniforms"
            autoComplete="off"
            value={form.uniform}
            onChange={set('uniform')}
            className={formControl}
          />
          <datalist id="ev-uniforms">
            {suggest.uniforms.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </FormRow>

        {game && (
          <label className="flex min-h-10 items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
            <span>
              <span className="block text-sm font-semibold text-foreground">{t('schedule.editor.excludeStats')}</span>
              <span className="block text-xs text-muted-foreground">{t('schedule.editor.excludeStatsHelp')}</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={form.excludeFromStats}
              onChange={(e) => set('excludeFromStats')(e.target.checked)}
              className="h-5 w-5 shrink-0"
            />
          </label>
        )}

        <h3 className="border-b border-border pb-1 pt-2 text-sm font-semibold text-muted-foreground">
          {t('schedule.editor.sectionWhere')}
        </h3>

        <FormRow label={t('schedule.editor.location')} htmlFor="ev-location">
          <input
            id="ev-location"
            list="ev-locations"
            autoComplete="off"
            value={form.location}
            onChange={set('location')}
            placeholder={t('schedule.editor.locationPlaceholder')}
            className={formControl}
          />
          <datalist id="ev-locations">
            {suggest.locations.map((v) => (
              <option key={v} value={v} />
            ))}
          </datalist>
        </FormRow>

        <FormRow label={t('schedule.editor.locationDetails')} htmlFor="ev-location-details">
          <input
            id="ev-location-details"
            value={form.locationDetails}
            maxLength={300}
            onChange={set('locationDetails')}
            placeholder={t('schedule.editor.locationDetailsPlaceholder')}
            className={formControl}
          />
        </FormRow>

        <FormRow label={t('schedule.editor.meetingUrl')} htmlFor="ev-meeting">
          <input
            id="ev-meeting"
            type="url"
            inputMode="url"
            value={form.meetingUrl}
            onChange={set('meetingUrl')}
            placeholder="https://"
            className={formControl}
          />
        </FormRow>

        <FormRow label={t('schedule.editor.notes')} htmlFor="ev-notes">
          <textarea id="ev-notes" rows={3} value={form.notes} onChange={set('notes')} className={formControl} />
        </FormRow>

        <label className="flex min-h-10 items-center gap-2 text-sm font-semibold text-foreground">
          <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} className="h-4 w-4" />
          <Bell size={15} aria-hidden="true" />
          {t('schedule.editor.notifyTeam')}
        </label>

        {errors.length > 0 && (
          <ul role="alert" className="space-y-1 text-sm text-destructive">
            {errors.map((k) => (
              <li key={k}>{t(`schedule.editor.err_${k}`)}</li>
            ))}
          </ul>
        )}
        {failure && (
          <p role="alert" className="text-sm text-destructive">
            {failure}
          </p>
        )}

        {!isNew && (
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <button
              type="button"
              disabled={busy}
              onClick={handleCancelToggle}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50"
            >
              {dbEvent.isCancelled ? <RotateCcw size={14} /> : <Ban size={14} />}
              {dbEvent.isCancelled ? t('schedule.editor.restore') : t('schedule.editor.cancelEvent')}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleDelete}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-destructive/40 px-3 text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50"
            >
              <Trash2 size={14} />
              {inSeries && scope === 'following' ? t('schedule.editor.deleteFollowing') : t('schedule.editor.delete')}
            </button>
          </div>
        )}
      </ResponsiveModal.Body>

      <ResponsiveModal.Footer>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-muted-foreground hover:bg-muted"
        >
          {t('common.cancel')}
        </button>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy ? t('common.saving') : isNew ? t('schedule.editor.add') : t('schedule.editor.save')}
        </button>
      </ResponsiveModal.Footer>
    </ResponsiveModal>
  );
}
