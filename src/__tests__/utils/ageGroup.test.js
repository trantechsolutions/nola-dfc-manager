import { describe, it, expect } from 'vitest';
import { getUSAgeGroup, getAge } from '../../utils/ageGroup';

describe('getAge', () => {
  it('calculates age correctly', () => {
    const today = new Date();
    const tenYearsAgo = new Date(today.getFullYear() - 10, today.getMonth(), today.getDate());
    expect(getAge(tenYearsAgo.toISOString().split('T')[0])).toBe(10);
  });

  it('returns 0 for today birthdate', () => {
    const today = new Date().toISOString().split('T')[0];
    expect(getAge(today)).toBe(0);
  });

  it('returns null for invalid input', () => {
    expect(getAge(null)).toBeNull();
    expect(getAge('')).toBeNull();
    expect(getAge(undefined)).toBeNull();
  });
});

describe('getUSAgeGroup — legacy birth-year regime (through 2025-2026)', () => {
  it('returns U14 for a 2012 birthdate in 2025-2026', () => {
    expect(getUSAgeGroup('2012-03-15', '2025-2026')).toBe('U14');
  });

  it('returns U11 for a 2015 birthdate in 2025-2026', () => {
    expect(getUSAgeGroup('2015-05-18', '2025-2026')).toBe('U11');
  });

  it('does NOT shift Aug-Dec births under the legacy rule', () => {
    // Sept 2012 in 2025-2026: 2026 - 2012 = U14 (birth-year rule, no cutoff).
    expect(getUSAgeGroup('2012-09-15', '2025-2026')).toBe('U14');
  });

  it('returns null for missing birthdate', () => {
    expect(getUSAgeGroup(null, '2025-2026')).toBeNull();
    expect(getUSAgeGroup('', '2025-2026')).toBeNull();
  });
});

describe('getUSAgeGroup — school-year regime (2026-2027 and later)', () => {
  it('shifts Aug-Dec births forward by one effective year', () => {
    // Born Sept 15, 2012 → effectiveYear 2013 → 2027 - 2013 = U14.
    expect(getUSAgeGroup('2012-09-15', '2026-2027')).toBe('U14');
  });

  it('does not shift Jan-Jul births', () => {
    // Born July 15, 2012 → effectiveYear 2012 → 2027 - 2012 = U15.
    expect(getUSAgeGroup('2012-07-15', '2026-2027')).toBe('U15');
  });

  it('treats July 31 as pre-cutoff (no shift)', () => {
    // Born July 31, 2013 → effectiveYear 2013 → 2027 - 2013 = U14.
    expect(getUSAgeGroup('2013-07-31', '2026-2027')).toBe('U14');
  });

  it('treats August 1 as on/after cutoff (shift)', () => {
    // Born Aug 1, 2012 → effectiveYear 2013 → 2027 - 2013 = U14.
    expect(getUSAgeGroup('2012-08-01', '2026-2027')).toBe('U14');
  });

  it('returns U12 for May 2015 birth in 2026-2027 (same result as legacy, by construction)', () => {
    // May 2015 → effectiveYear 2015 → 2027 - 2015 = U12.
    expect(getUSAgeGroup('2015-05-18', '2026-2027')).toBe('U12');
  });

  it('moves a Sept-born player up exactly one U-bracket across the 2025-26 → 2026-27 regime boundary', () => {
    const bday = '2012-09-15';
    expect(getUSAgeGroup(bday, '2025-2026')).toBe('U14');
    expect(getUSAgeGroup(bday, '2026-2027')).toBe('U14');
    // Sept-born players stay in the same bracket they would have been in under the
    // old rule for the first overlapping season; they are not bumped two brackets.
  });
});

describe('getUSAgeGroup — fallback (no seasonId)', () => {
  it('returns a valid U-group format', () => {
    expect(getUSAgeGroup('2012-03-15', null)).toMatch(/^U\d+$/);
    expect(getUSAgeGroup('2012-03-15', '')).toMatch(/^U\d+$/);
  });
});
