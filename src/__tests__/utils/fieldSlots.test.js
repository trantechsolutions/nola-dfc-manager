// The field board is a shared resource: what these functions decide is
// whether a block reads as open, taken, or off-limits. Getting that wrong
// double-books a Saturday or hides a closure the club declared, so the
// grid rules are pinned here rather than trusted to the view.
import { describe, it, expect } from 'vitest';
import {
  SLOT_TIMES,
  buildFieldDay,
  buildGrid,
  findClosure,
  canTransition,
  formatSlot,
  weekendStart,
  weekendDates,
  addDays,
  parseDate,
  refereeTotal,
  openingsCount,
} from '../../utils/fieldSlots';

const booking = (overrides = {}) => ({
  id: 'b1',
  fieldId: 'f1',
  bookingDate: '2026-08-22',
  slotTime: '10:00:00',
  status: 'pending',
  teamId: 't1',
  refereesNeeded: 2,
  createdAt: '2026-08-01T10:00:00Z',
  ...overrides,
});

const closure = (overrides = {}) => ({
  id: 'c1',
  fieldId: 'f1',
  startDate: '2026-08-22',
  endDate: '2026-08-22',
  slotTime: null,
  reason: 'Resodding',
  ...overrides,
});

describe('parseDate', () => {
  it('reads a date string as local, not UTC', () => {
    // new Date('2026-08-22') is UTC midnight, which is Aug 21 in New Orleans —
    // the whole schedule would render a day early.
    const date = parseDate('2026-08-22');
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(7);
    expect(date.getDate()).toBe(22);
  });

  it('returns null for anything that is not YYYY-MM-DD', () => {
    expect(parseDate('8/22/2026')).toBeNull();
    expect(parseDate(undefined)).toBeNull();
  });
});

describe('weekendStart', () => {
  it('keeps a Saturday where it is', () => {
    expect(weekendStart('2026-08-22')).toBe('2026-08-22');
  });

  it('walks a Sunday back to its own Saturday, not forward', () => {
    expect(weekendStart('2026-08-23')).toBe('2026-08-22');
  });

  it('walks a midweek date back to the Saturday just gone', () => {
    expect(weekendStart('2026-08-26')).toBe('2026-08-22');
  });

  it('pairs the weekend as Saturday and Sunday', () => {
    expect(weekendDates('2026-08-23')).toEqual(['2026-08-22', '2026-08-23']);
  });

  it('crosses a month boundary', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
  });
});

describe('formatSlot', () => {
  it('renders noon and midnight as 12, not 0', () => {
    expect(formatSlot('12:00:00')).toBe('12:00 PM');
    expect(formatSlot('00:00:00')).toBe('12:00 AM');
  });

  it('renders the afternoon blocks the way the sheet does', () => {
    expect(formatSlot('16:00:00')).toBe('4:00 PM');
  });
});

describe('findClosure', () => {
  it('matches a closure that covers every field', () => {
    const hit = findClosure([closure({ fieldId: null })], { fieldId: 'f2', date: '2026-08-22', slotTime: '08:00:00' });
    expect(hit).not.toBeNull();
  });

  it('ignores a closure on another field', () => {
    const hit = findClosure([closure({ fieldId: 'f9' })], { fieldId: 'f1', date: '2026-08-22', slotTime: '08:00:00' });
    expect(hit).toBeNull();
  });

  it('closes only the block it names', () => {
    const closures = [closure({ slotTime: '10:00:00' })];
    expect(findClosure(closures, { fieldId: 'f1', date: '2026-08-22', slotTime: '10:00:00' })).not.toBeNull();
    expect(findClosure(closures, { fieldId: 'f1', date: '2026-08-22', slotTime: '08:00:00' })).toBeNull();
  });

  it('covers every day inside the range', () => {
    const closures = [closure({ startDate: '2026-08-20', endDate: '2026-08-25' })];
    expect(findClosure(closures, { fieldId: 'f1', date: '2026-08-23', slotTime: '08:00:00' })).not.toBeNull();
    expect(findClosure(closures, { fieldId: 'f1', date: '2026-08-26', slotTime: '08:00:00' })).toBeNull();
  });
});

describe('buildFieldDay', () => {
  const day = (bookings = [], closures = []) =>
    buildFieldDay({ fieldId: 'f1', date: '2026-08-22', bookings, closures });

  it('always lays out every block, booked or not', () => {
    expect(day().map((slot) => slot.slotTime)).toEqual(SLOT_TIMES);
    expect(day().every((slot) => slot.state === 'open')).toBe(true);
  });

  it('marks a pending request as pending, not as taken', () => {
    const [, second] = day([booking()]);
    expect(second.state).toBe('pending');
    expect(second.booking.id).toBe('b1');
  });

  it('releases a block whose only requests were declined or cancelled', () => {
    const slots = day([booking({ status: 'declined' }), booking({ id: 'b2', status: 'cancelled' })]);
    expect(slots[1].state).toBe('open');
    expect(slots[1].booking).toBeNull();
  });

  it('keeps competing requests visible instead of showing only the first', () => {
    const slots = day([booking(), booking({ id: 'b2', teamId: 't2', createdAt: '2026-08-02T10:00:00Z' })]);
    expect(slots[1].requests).toHaveLength(2);
    // Oldest request leads — the queue is in the order it formed.
    expect(slots[1].booking.id).toBe('b1');
  });

  it('shows the confirmed booking even when a pending one was filed first', () => {
    const slots = day([booking(), booking({ id: 'b2', status: 'confirmed', createdAt: '2026-08-05T10:00:00Z' })]);
    expect(slots[1].state).toBe('confirmed');
    expect(slots[1].booking.id).toBe('b2');
  });

  it('closes an empty block the club has taken off the board', () => {
    const slots = day([], [closure()]);
    expect(slots.every((slot) => slot.state === 'closed')).toBe(true);
    expect(slots[0].closure.reason).toBe('Resodding');
  });

  it('lets a confirmed game outrank a closure added afterwards', () => {
    // The alternative is a game silently vanishing off the board because
    // someone closed the field around it.
    const slots = day([booking({ status: 'confirmed' })], [closure()]);
    expect(slots[1].state).toBe('confirmed');
  });

  it('ignores bookings on another field or another day', () => {
    const slots = day([booking({ fieldId: 'f2' }), booking({ id: 'b2', bookingDate: '2026-08-23' })]);
    expect(slots.every((slot) => slot.state === 'open')).toBe(true);
  });
});

describe('buildGrid totals', () => {
  const grid = buildGrid({
    dates: ['2026-08-22', '2026-08-23'],
    fields: [{ id: 'f1' }, { id: 'f2' }],
    bookings: [
      booking({ status: 'confirmed', refereesNeeded: 3 }),
      booking({ id: 'b2', fieldId: 'f2', slotTime: '14:00:00', status: 'pending', refereesNeeded: 2 }),
    ],
    closures: [closure({ fieldId: 'f2', slotTime: '08:00:00' })],
  });

  it('counts only what the club actually has to staff', () => {
    // The pending request's 2 refs are not booked yet — nothing has been promised.
    expect(refereeTotal(grid)).toBe(3);
  });

  it('counts the blocks still on offer', () => {
    // 2 days × 2 fields × 5 blocks = 20, less one confirmed, one pending and
    // one closed block.
    expect(openingsCount(grid)).toBe(17);
  });
});

describe('canTransition', () => {
  it('allows a club admin to settle a pending request either way', () => {
    expect(canTransition('pending', 'confirmed')).toBe(true);
    expect(canTransition('pending', 'declined')).toBe(true);
  });

  it('allows a confirmed booking to be given back', () => {
    expect(canTransition('confirmed', 'cancelled')).toBe(true);
  });

  it('refuses to quietly un-approve a confirmed booking', () => {
    expect(canTransition('confirmed', 'pending')).toBe(false);
  });

  it('treats declined and cancelled as final', () => {
    expect(canTransition('declined', 'confirmed')).toBe(false);
    expect(canTransition('cancelled', 'pending')).toBe(false);
  });
});
