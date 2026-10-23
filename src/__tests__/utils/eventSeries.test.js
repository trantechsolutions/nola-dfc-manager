import { describe, expect, it } from 'vitest';
import {
  MAX_SESSIONS,
  atLocal,
  eventRow,
  expandSeries,
  gameTitle,
  isoDay,
  validateEvent,
} from '../../utils/eventSeries';

describe('expandSeries', () => {
  // Tue + Thu across two weeks: Oct 6 2026 is a Tuesday.
  const series = {
    weekdays: [2, 4],
    startTime: '18:00',
    endTime: '19:30',
    startsOn: '2026-10-06',
    endsOn: '2026-10-15',
  };

  it('makes a session on each chosen weekday, in local time', () => {
    const { sessions } = expandSeries(series);
    expect(sessions.map((s) => s.day)).toEqual(['2026-10-06', '2026-10-08', '2026-10-13', '2026-10-15']);
    expect(sessions[0].start.getHours()).toBe(18);
    expect(sessions[0].end.getHours()).toBe(19);
    expect(sessions[0].end.getMinutes()).toBe(30);
  });

  it('skips blackout dates and says which', () => {
    const { sessions, skipped } = expandSeries(series, { blackouts: ['2026-10-08'] });
    expect(sessions.map((s) => s.day)).toEqual(['2026-10-06', '2026-10-13', '2026-10-15']);
    expect(skipped).toEqual(['2026-10-08']);
  });

  it('keeps blackout dates when told to', () => {
    expect(expandSeries(series, { blackouts: ['2026-10-08'], skipBlackouts: false }).sessions).toHaveLength(4);
  });

  it('stops at the cap rather than writing a year of mistakes', () => {
    const r = expandSeries({
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      startTime: '18:00',
      startsOn: '2026-01-01',
      endsOn: '2027-12-31',
    });
    expect(r.sessions).toHaveLength(MAX_SESSIONS);
    expect(r.capped).toBe(true);
  });

  it('makes nothing from an incomplete series', () => {
    expect(expandSeries({ ...series, weekdays: [] }).sessions).toEqual([]);
    expect(expandSeries({ ...series, endsOn: '2026-10-01' }).sessions).toEqual([]);
  });

  it('has no end time when none was given', () => {
    expect(expandSeries({ ...series, endTime: '' }).sessions[0].end).toBeNull();
  });
});

describe('gameTitle', () => {
  it('reads home, away and unknown', () => {
    expect(gameTitle('Mandeville FC', true)).toBe('vs Mandeville FC');
    expect(gameTitle('Mandeville FC', false)).toBe('@ Mandeville FC');
    expect(gameTitle('Mandeville FC', null)).toBe('Mandeville FC');
    expect(gameTitle('  ', true)).toBe('');
  });
});

describe('eventRow', () => {
  const base = {
    eventType: 'league',
    title: '',
    opponent: 'Slidell Storm',
    isHome: false,
    day: '2026-10-24',
    startTime: '09:00',
    endTime: '10:30',
    location: ' City Park Field 4 ',
    arrivalMinutes: '45',
    uniform: 'White',
    notes: '',
  };

  it('fills a game title from the opponent and venue', () => {
    expect(eventRow(base).title).toBe('@ Slidell Storm');
  });

  it('keeps a title that was typed', () => {
    expect(eventRow({ ...base, title: 'Fall Cup final' }).title).toBe('Fall Cup final');
  });

  it('stores times, arrival and details as columns', () => {
    const row = eventRow(base);
    expect(row.event_date).toBe(atLocal('2026-10-24', '09:00').toISOString());
    expect(row.end_date).toBe(atLocal('2026-10-24', '10:30').toISOString());
    expect(row.arrival_minutes).toBe(45);
    expect(row.location).toBe('City Park Field 4');
    expect(row.uniform).toBe('White');
    expect(row.description).toBeNull();
    expect(row).toMatchObject({
      event_type: 'league',
      type_locked: true,
      opponent: 'Slidell Storm',
      is_home: false,
      source: 'app',
    });
  });

  it('leaves out game fields on a practice', () => {
    const row = eventRow({ ...base, eventType: 'practice', title: 'Practice' });
    expect(row.opponent).toBeNull();
    expect(row.is_home).toBeNull();
  });

  it('drops an end time before the start and a blank arrival', () => {
    const row = eventRow({ ...base, endTime: '08:00', arrivalMinutes: '' });
    expect(row.end_date).toBeNull();
    expect(row.arrival_minutes).toBeNull();
  });
});

describe('validateEvent', () => {
  const ok = { eventType: 'practice', title: 'Practice', day: '2026-10-24', startTime: '18:00', endTime: '19:30' };

  it('passes a complete event', () => {
    expect(validateEvent(ok)).toEqual([]);
  });

  it('needs a day, a start and a name', () => {
    expect(validateEvent({ eventType: 'practice' })).toEqual(['dayRequired', 'startRequired', 'titleRequired']);
  });

  it('accepts a game named by its opponent alone', () => {
    expect(validateEvent({ ...ok, eventType: 'league', title: '', opponent: 'HFC' })).toEqual([]);
  });

  it('catches an end before the start', () => {
    expect(validateEvent({ ...ok, endTime: '17:00' })).toEqual(['endBeforeStart']);
  });

  it('checks a repeat has days and ends after it starts', () => {
    expect(validateEvent(ok, { repeat: { weekdays: [], endsOn: '2026-10-01' } })).toEqual([
      'weekdaysRequired',
      'untilAfterStart',
    ]);
  });
});

describe('isoDay', () => {
  it('formats a local date', () => {
    expect(isoDay(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
