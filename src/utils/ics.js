// ── One event as a calendar file ─────────────────────────────────────────
// "Add to calendar" hands the phone a single-event .ics, which iOS, Android
// and desktop calendars all open as an "add this event?" sheet. No account,
// no API, nothing to authorise — and it works offline from a cached schedule.

// The feed carries a start time only. Ninety minutes covers a youth game with
// warm-up; a family can stretch it in their own calendar.
const DEFAULT_MINUTES = 90;

const stamp = (date) =>
  date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

// RFC 5545 text: backslash, semicolon and comma are escaped; newlines become \n.
const text = (value) =>
  String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');

/**
 * @param {{ id, title, timestamp, location?, description? }} event  a schedule event (timestamp in seconds)
 * @param {{ teamName?: string, now?: Date }} [opts]
 * @returns {string} an iCalendar document holding the one event
 */
export function buildEventIcs(event, { teamName, now = new Date() } = {}) {
  const start = new Date(event.timestamp * 1000);
  const end = new Date(start.getTime() + DEFAULT_MINUTES * 60 * 1000);
  const summary = teamName ? `${teamName}: ${event.title}` : event.title;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Cantera Manager//Schedule//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${text(event.id || `${event.timestamp}@cantera`)}`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${text(summary)}`,
  ];
  if (event.location && event.location !== 'TBD') lines.push(`LOCATION:${text(event.location)}`);
  if (event.description) lines.push(`DESCRIPTION:${text(event.description)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

/** Hand the event to the device's calendar as a download. */
export function downloadEventIcs(event, opts) {
  const blob = new Blob([buildEventIcs(event, opts)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${String(event.title || 'event')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase()}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * The team feed as a subscription link: calendars treat webcal:// as "keep
 * this updated" where https:// would import a one-off copy. Null for a feed
 * that is not a plain web URL.
 */
export function subscribeUrl(icalUrl) {
  if (!icalUrl || !/^https?:\/\//i.test(icalUrl)) return null;
  return icalUrl.replace(/^https?:\/\//i, 'webcal://');
}
