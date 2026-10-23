// ── Events the app runs itself ───────────────────────────────────────────
// When a team's schedule is run here (teams.schedule_source = 'app'), staff add
// events and repeating practices in the app. These helpers turn the event form
// into a team_events row and a practice series into its sessions. Times are the
// staff member's local time, the same clock they typed them on.

// Most practices are under 2½ months; a season's worth of three-a-week is ~60.
// The cap stops a mistyped year from writing thousands of rows.
export const MAX_SESSIONS = 200;

const pad = (n) => String(n).padStart(2, '0');

/** "2026-10-22" for a local date. */
export const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** A local Date from "2026-10-22" and "18:00". */
export function atLocal(day, time = '00:00') {
  const [y, m, d] = day.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
}

/**
 * The sessions a repeating practice makes, oldest first.
 * series: { weekdays: [0-6, Sunday = 0], startTime: "18:00", endTime?: "19:30", startsOn, endsOn }
 * → { sessions: [{ day, start: Date, end: Date | null }], skipped: [day], capped: boolean }
 */
export function expandSeries(series, { blackouts = [], skipBlackouts = true } = {}) {
  const { weekdays = [], startTime, endTime, startsOn, endsOn } = series;
  const out = { sessions: [], skipped: [], capped: false };
  if (!weekdays.length || !startTime || !startsOn || !endsOn || endsOn < startsOn) return out;
  const days = new Set(weekdays.map(Number));
  const closed = new Set(blackouts);
  const last = atLocal(endsOn);
  for (let d = atLocal(startsOn); d <= last; d.setDate(d.getDate() + 1)) {
    if (!days.has(d.getDay())) continue;
    const day = isoDay(d);
    if (skipBlackouts && closed.has(day)) {
      out.skipped.push(day);
      continue;
    }
    if (out.sessions.length >= MAX_SESSIONS) {
      out.capped = true;
      break;
    }
    out.sessions.push({ day, start: atLocal(day, startTime), end: endTime ? atLocal(day, endTime) : null });
  }
  return out;
}

const GAMES = ['league', 'friendly', 'tournament'];
export const isGameType = (type) => GAMES.includes(type);

/** "vs Mandeville FC" at home, "@ Mandeville FC" away, or the opponent alone when it isn't known. */
export function gameTitle(opponent, isHome) {
  const name = (opponent || '').trim();
  if (!name) return '';
  return isHome === false ? `@ ${name}` : isHome === true ? `vs ${name}` : name;
}

/** Minutes from an arrive-by time ("08:15") to the start ("09:00"), or null when not set or not before it. */
export function arrivalMinutesFrom(startTime, arrivalTime) {
  if (!startTime || !arrivalTime) return null;
  const mins = (t) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + (m || 0);
  };
  const diff = mins(startTime) - mins(arrivalTime);
  return diff > 0 ? Math.min(240, diff) : null;
}

/** A video call link as typed, with https:// added when left off; null when blank. */
export function normalizeUrl(url) {
  const v = (url || '').trim();
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

/**
 * The team_events columns for one event from the editor form.
 * form: { eventType, title, opponent, isHome, day, startTime, endDay?, endTime, location, locationDetails,
 *         meetingUrl, arrivalTime | arrivalMinutes, uniform, notes, excludeFromStats }
 * endDay is for an event over more than one day (a tournament weekend); without it the event ends the day it starts.
 */
export function eventRow(form) {
  const game = isGameType(form.eventType);
  const title = (form.title || '').trim() || (game ? gameTitle(form.opponent, form.isHome) : '');
  const start = atLocal(form.day, form.startTime);
  const end = form.endTime ? atLocal(form.endDay || form.day, form.endTime) : null;
  const arrival =
    form.arrivalTime !== undefined
      ? arrivalMinutesFrom(form.startTime, form.arrivalTime)
      : form.arrivalMinutes === '' || form.arrivalMinutes == null
        ? null
        : Number(form.arrivalMinutes);
  return {
    title,
    event_type: form.eventType,
    // A type chosen here is the type: a later feed import must not reclassify it.
    type_locked: true,
    location: (form.location || '').trim() || null,
    location_details: (form.locationDetails || '').trim() || null,
    meeting_url: normalizeUrl(form.meetingUrl),
    description: (form.notes || '').trim() || null,
    event_date: start.toISOString(),
    end_date: end && end > start ? end.toISOString() : null,
    arrival_minutes: Number.isFinite(arrival) && arrival > 0 ? Math.min(240, Math.round(arrival)) : null,
    uniform: (form.uniform || '').trim() || null,
    opponent: game ? (form.opponent || '').trim() || null : null,
    is_home: game && typeof form.isHome === 'boolean' ? form.isHome : null,
    exclude_from_stats: game ? !!form.excludeFromStats : false,
    source: 'app',
    updated_at: new Date().toISOString(),
  };
}

/** What the editor needs to know about a form before saving: a list of message keys, empty when fine. */
export function validateEvent(form, { repeat = null } = {}) {
  const errors = [];
  if (!form.day) errors.push('dayRequired');
  if (!form.startTime) errors.push('startRequired');
  if (form.endTime && form.startTime && form.day) {
    const start = atLocal(form.day, form.startTime);
    const end = atLocal(form.endDay || form.day, form.endTime);
    if (end <= start) errors.push('endBeforeStart');
  }
  if (form.arrivalTime && form.startTime && arrivalMinutesFrom(form.startTime, form.arrivalTime) === null) {
    errors.push('arrivalAfterStart');
  }
  const game = isGameType(form.eventType);
  if (!(form.title || '').trim() && !(game && (form.opponent || '').trim())) errors.push('titleRequired');
  if (repeat) {
    if (!repeat.weekdays?.length) errors.push('weekdaysRequired');
    if (!repeat.endsOn || repeat.endsOn < form.day) errors.push('untilAfterStart');
  }
  return errors;
}
