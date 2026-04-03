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

describe('getUSAgeGroup', () => {
  it('returns correct age group for a 2012 birthdate in 2025-2026 season', () => {
    // US Soccer: age group = season end year - birth year
    // 2026 - 2012 = U14
    const result = getUSAgeGroup('2012-03-15', '2025-2026');
    expect(result).toBe('U14');
  });

  it('returns correct age group for a 2015 birthdate in 2025-2026 season', () => {
    // 2026 - 2015 = U11
    const result = getUSAgeGroup('2015-05-18', '2025-2026');
    expect(result).toBe('U11');
  });

  it('returns correct age group across season boundary', () => {
    // 2027 - 2015 = U12
    const result = getUSAgeGroup('2015-05-18', '2026-2027');
    expect(result).toBe('U12');
  });

  it('returns null for missing birthdate', () => {
    expect(getUSAgeGroup(null, '2025-2026')).toBeNull();
    expect(getUSAgeGroup('', '2025-2026')).toBeNull();
  });

  it('falls back to current year when season is missing', () => {
    // With no season, it uses currentYear + 1 as reference
    const result = getUSAgeGroup('2012-03-15', null);
    expect(result).toMatch(/^U\d+$/);
    const result2 = getUSAgeGroup('2012-03-15', '');
    expect(result2).toMatch(/^U\d+$/);
  });
});
