import { describe, it, expect } from 'vitest';
import {
  getSeasonDateRange,
  getSeasonForDate,
  getSeasonForTimestamp,
  filterEventsBySeason,
} from '../../utils/seasonUtils';

describe('getSeasonDateRange', () => {
  it('returns Aug 1 to Jul 31 for a season', () => {
    const range = getSeasonDateRange('2025-2026');
    expect(range.start.getMonth()).toBe(7); // August = 7
    expect(range.start.getDate()).toBe(1);
    expect(range.start.getFullYear()).toBe(2025);
    expect(range.end.getMonth()).toBe(6); // July = 6
    expect(range.end.getDate()).toBe(31);
    expect(range.end.getFullYear()).toBe(2026);
  });

  it('returns timestamps in seconds', () => {
    const range = getSeasonDateRange('2025-2026');
    expect(typeof range.startTimestamp).toBe('number');
    expect(typeof range.endTimestamp).toBe('number');
    expect(range.endTimestamp).toBeGreaterThan(range.startTimestamp);
    // Timestamps should be in seconds (< 10 billion), not ms
    expect(range.startTimestamp).toBeLessThan(10_000_000_000);
  });

  it('handles different season formats', () => {
    const range = getSeasonDateRange('2024-2025');
    expect(range.start.getFullYear()).toBe(2024);
    expect(range.end.getFullYear()).toBe(2025);
  });
});

describe('getSeasonForDate', () => {
  it('returns correct season for a fall date string', () => {
    const seasonIds = ['2024-2025', '2025-2026'];
    const result = getSeasonForDate('2025-10-15', seasonIds);
    expect(result).toBe('2025-2026');
  });

  it('returns correct season for a spring date string', () => {
    const seasonIds = ['2024-2025', '2025-2026'];
    const result = getSeasonForDate('2025-03-15', seasonIds);
    expect(result).toBe('2024-2025');
  });

  it('returns null for a date outside all seasons', () => {
    const seasonIds = ['2025-2026'];
    // July 2025 is before Aug 1 2025, outside 2025-2026
    const result = getSeasonForDate('2025-07-15', seasonIds);
    expect(result).toBeNull();
  });

  it('returns null for empty season list', () => {
    const result = getSeasonForDate('2025-09-01', []);
    expect(result).toBeNull();
  });

  it('returns null for null date', () => {
    const result = getSeasonForDate(null, ['2025-2026']);
    expect(result).toBeNull();
  });
});

describe('getSeasonForTimestamp', () => {
  it('returns correct season for a Unix timestamp', () => {
    const seasonIds = ['2025-2026'];
    const ts = Math.floor(new Date('2025-09-01T12:00:00').getTime() / 1000);
    const result = getSeasonForTimestamp(ts, seasonIds);
    expect(result).toBe('2025-2026');
  });

  it('returns null for timestamp outside range', () => {
    const seasonIds = ['2025-2026'];
    const ts = Math.floor(new Date('2024-07-01T12:00:00').getTime() / 1000);
    const result = getSeasonForTimestamp(ts, seasonIds);
    expect(result).toBeNull();
  });
});

describe('filterEventsBySeason', () => {
  it('filters events within the season date range', () => {
    const range = getSeasonDateRange('2025-2026');
    const events = {
      upcoming: [
        { timestamp: range.startTimestamp + 3600, title: 'In season' },
        { timestamp: range.endTimestamp + 86400, title: 'After season' },
      ],
      past: [{ timestamp: range.startTimestamp + 7200, title: 'Past in season' }],
    };
    const filtered = filterEventsBySeason(events, '2025-2026');
    expect(filtered.upcoming).toHaveLength(1);
    expect(filtered.upcoming[0].title).toBe('In season');
    expect(filtered.past).toHaveLength(1);
  });

  it('returns empty arrays for no matches', () => {
    const events = { upcoming: [], past: [] };
    const filtered = filterEventsBySeason(events, '2025-2026');
    expect(filtered.upcoming).toHaveLength(0);
    expect(filtered.past).toHaveLength(0);
  });
});
