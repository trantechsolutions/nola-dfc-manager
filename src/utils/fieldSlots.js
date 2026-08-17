// src/utils/fieldSlots.js
// ──────────────────────────────────────────────────────────────────────
// The shape of a field day.
//
// The club's home-field sheet is a grid, not a calendar: five two-hour
// blocks per field per day, the same five every day, and a game either
// holds a block or it doesn't. Nothing generates rows for the empty
// ones — a booking simply names the block it holds (date + slot time),
// and the grid is rebuilt here from these constants every render.
//
// Everything in this file is pure so the booking rules (is this block
// open? closed? already taken?) can be tested without a database.
// ──────────────────────────────────────────────────────────────────────

/**
 * The bookable blocks, as stored: 24h `HH:MM:SS` to match Postgres `time`.
 * Changing this list changes the grid everywhere; existing bookings keep
 * whatever slot_time they were written with.
 */
export const SLOT_TIMES = ['08:00:00', '10:00:00', '12:00:00', '14:00:00', '16:00:00'];

/** How long a block runs, in minutes. Used only for display. */
export const SLOT_MINUTES = 120;

/** What a booking can be. Mirrors the CHECK constraint on field_bookings.status. */
export const BOOKING_STATUS = {
  pending: 'pending',
  confirmed: 'confirmed',
  declined: 'declined',
  cancelled: 'cancelled',
};

/**
 * Statuses that still occupy the block. A declined or cancelled request
 * releases the slot; a pending one does not, it queues behind whoever
 * else wants it.
 */
export const ACTIVE_STATUSES = [BOOKING_STATUS.pending, BOOKING_STATUS.confirmed];

/** Game types offered in the booking form. `key` is what gets stored. */
export const GAME_TYPES = ['Friendly', 'League', 'Scrimmage', 'Tournament', 'Practice', 'Other'];

/**
 * Legal status moves. A confirmed booking can still be cancelled (rain,
 * a forfeit) but never silently reverts to pending — re-approving is a
 * new decision, so it goes back through a fresh request.
 */
const TRANSITIONS = {
  pending: ['confirmed', 'declined', 'cancelled'],
  confirmed: ['cancelled'],
  declined: [],
  cancelled: [],
};

export const canTransition = (from, to) => (TRANSITIONS[from] || []).includes(to);

/** `'14:00:00'` → `'2:00 PM'`. Locale-free on purpose: the grid is a fixed ruler. */
export function formatSlot(slotTime) {
  const [rawHour, minute] = String(slotTime || '').split(':');
  const hour = Number(rawHour);
  if (Number.isNaN(hour)) return String(slotTime || '');
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const display = hour % 12 === 0 ? 12 : hour % 12;
  return `${display}:${minute ?? '00'} ${suffix}`;
}

/** `'2026-08-22'` → `'Saturday - August 22'`, the sheet's own day heading. */
export function formatDayHeading(dateStr) {
  const date = parseDate(dateStr);
  if (!date) return dateStr;
  return `${date.toLocaleDateString(undefined, { weekday: 'long' })} - ${date.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
  })}`;
}

/**
 * Dates are `YYYY-MM-DD` strings everywhere in this feature and are parsed
 * as local noon, never as UTC midnight — `new Date('2026-08-22')` is UTC
 * and lands on the 21st for anyone west of Greenwich, which would shift the
 * entire schedule by a day for the club that uses it.
 */
export function parseDate(dateStr) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''));
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12);
}

/** `Date` → `YYYY-MM-DD`, local. */
export function toDateStr(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(dateStr, days) {
  const date = parseDate(dateStr);
  if (!date) return dateStr;
  date.setDate(date.getDate() + days);
  return toDateStr(date);
}

/**
 * The Saturday on or before `dateStr`. The sheet is organised weekend by
 * weekend (Sat + Sun on one tab), so that pair is the unit the view pages
 * through.
 */
export function weekendStart(dateStr) {
  const date = parseDate(dateStr);
  if (!date) return dateStr;
  // 6 = Saturday. Sunday (0) belongs to the weekend that started yesterday.
  const daysSinceSaturday = (date.getDay() + 1) % 7;
  date.setDate(date.getDate() - daysSinceSaturday);
  return toDateStr(date);
}

/** The two dates of the weekend containing `dateStr`. */
export function weekendDates(dateStr) {
  const saturday = weekendStart(dateStr);
  return [saturday, addDays(saturday, 1)];
}

/**
 * Is this block closed, and why?
 *
 * A closure with no field_id closes every field; one with no slot_time
 * closes the whole day. Returns the closure that hit, so the grid can
 * show the reason rather than an unexplained grey box.
 */
export function findClosure(closures, { fieldId, date, slotTime }) {
  return (
    (closures || []).find((closure) => {
      if (closure.fieldId && closure.fieldId !== fieldId) return false;
      if (closure.slotTime && slotTime && closure.slotTime !== slotTime) return false;
      return date >= closure.startDate && date <= closure.endDate;
    }) || null
  );
}

/**
 * Builds one field's day: every block, with whatever is sitting in it.
 *
 * `state` is what the cell should render, not just what the booking says —
 * a closed block reads `closed` even when nothing was ever booked in it,
 * and a block whose only bookings were declined reads `open` again.
 *
 * @returns {Array<{slotTime, state, booking, requests, closure}>}
 *   state: 'open' | 'closed' | 'pending' | 'confirmed'
 *   booking: the confirmed booking, or the first pending one
 *   requests: every active booking in the block, so competing requests
 *             for the same slot stay visible instead of one hiding the rest
 */
export function buildFieldDay({ fieldId, date, bookings = [], closures = [] }) {
  return SLOT_TIMES.map((slotTime) => {
    const closure = findClosure(closures, { fieldId, date, slotTime });

    const requests = bookings
      .filter(
        (booking) =>
          booking.fieldId === fieldId &&
          booking.bookingDate === date &&
          booking.slotTime === slotTime &&
          ACTIVE_STATUSES.includes(booking.status),
      )
      .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));

    const confirmed = requests.find((booking) => booking.status === BOOKING_STATUS.confirmed) || null;
    const booking = confirmed || requests[0] || null;

    // A confirmed game outranks a closure added afterwards: the block still
    // shows the game, and the closure is the admin's problem to resolve.
    let state = 'open';
    if (confirmed) state = 'confirmed';
    else if (closure) state = 'closed';
    else if (booking) state = 'pending';

    return { slotTime, state, booking, requests, closure };
  });
}

/**
 * Every block of every field for a set of days — what the grid renders.
 *
 * @returns {Array<{date, fields: Array<{field, slots}>}>}
 */
export function buildGrid({ dates = [], fields = [], bookings = [], closures = [] }) {
  return dates.map((date) => ({
    date,
    fields: fields.map((field) => ({
      field,
      slots: buildFieldDay({ fieldId: field.id, date, bookings, closures }),
    })),
  }));
}

/** Referees to line up across a set of days — the number the club actually books. */
export function refereeTotal(grid) {
  return grid.reduce(
    (dayTotal, day) =>
      dayTotal +
      day.fields.reduce(
        (fieldTotal, { slots }) =>
          fieldTotal +
          slots.reduce(
            (slotTotal, slot) =>
              slotTotal + (slot.state === 'confirmed' ? Number(slot.booking?.refereesNeeded) || 0 : 0),
            0,
          ),
        0,
      ),
    0,
  );
}

/** Open blocks left in the grid — the "openings" half of the sheet. */
export function openingsCount(grid) {
  return grid.reduce(
    (dayTotal, day) =>
      dayTotal +
      day.fields.reduce(
        (fieldTotal, { slots }) => fieldTotal + slots.filter((slot) => slot.state === 'open').length,
        0,
      ),
    0,
  );
}
