import { describe, it, expect, vi, afterEach } from 'vitest';
import { toDateStr, todayStr, txEventDate, txActivityDate, hasSplitDates } from '../../utils/txDates';

afterEach(() => {
  vi.useRealTimers();
});

describe('toDateStr', () => {
  it('trims a timestamp down to the calendar day', () => {
    expect(toDateStr('2026-08-19T14:30:00Z')).toBe('2026-08-19');
  });

  it('reads the Firestore-style { seconds } shape', () => {
    const seconds = Math.floor(Date.UTC(2026, 7, 19, 12) / 1000);
    expect(toDateStr({ seconds })).toBe('2026-08-19');
  });

  it('returns null for anything undated', () => {
    expect(toDateStr(null)).toBeNull();
    expect(toDateStr('')).toBeNull();
    expect(toDateStr({})).toBeNull();
  });
});

describe('todayStr', () => {
  it('uses the local calendar day, not UTC', () => {
    // 8pm in New Orleans is already tomorrow in UTC — the old
    // toISOString() form stamped transactions a day ahead every evening.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 19, 20, 0, 0));
    expect(todayStr()).toBe('2026-08-19');
  });
});

describe('txEventDate / txActivityDate', () => {
  // The reported case: registration paid in August for a November tournament.
  const registration = { rawDate: '2026-11-14', clearedDate: '2026-08-04', cleared: true };

  it('keeps the event date for season reporting', () => {
    expect(txEventDate(registration)).toBe('2026-11-14');
  });

  it('reconciles on the activity date', () => {
    expect(txActivityDate(registration)).toBe('2026-08-04');
  });

  it('falls back to the event date when no activity date was captured', () => {
    expect(txActivityDate({ rawDate: '2026-09-26' })).toBe('2026-09-26');
  });

  it('reads the { seconds } date shape when rawDate is absent', () => {
    const seconds = Math.floor(Date.UTC(2026, 8, 26, 12) / 1000);
    expect(txActivityDate({ date: { seconds } })).toBe('2026-09-26');
  });

  it('returns null for a missing transaction', () => {
    expect(txActivityDate(null)).toBeNull();
    expect(txEventDate(undefined)).toBeNull();
  });
});

describe('hasSplitDates', () => {
  it('is true only when the two dates disagree', () => {
    expect(hasSplitDates({ rawDate: '2026-11-14', clearedDate: '2026-08-04' })).toBe(true);
    expect(hasSplitDates({ rawDate: '2026-08-04', clearedDate: '2026-08-04' })).toBe(false);
    expect(hasSplitDates({ rawDate: '2026-11-14' })).toBe(false);
  });
});
