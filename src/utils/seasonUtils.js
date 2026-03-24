// src/utils/seasonUtils.js
// Parses season IDs (e.g., "2025-2026") into date boundaries.
// Season runs August 1 of the first year to July 31 of the second year.

/**
 * Parse a season ID like "2025-2026" into start/end dates.
 * Returns { start: Date, end: Date, startTimestamp: number, endTimestamp: number }
 */
export function getSeasonDateRange(seasonId) {
  const parts = seasonId.split('-');
  const startYear = parseInt(parts[0], 10);
  const endYear = parseInt(parts[1], 10) || startYear + 1;

  const start = new Date(startYear, 7, 1); // August 1
  const end = new Date(endYear, 6, 31, 23, 59, 59); // July 31, 23:59:59

  return {
    start,
    end,
    startTimestamp: Math.floor(start.getTime() / 1000),
    endTimestamp: Math.floor(end.getTime() / 1000),
  };
}

/**
 * Determine which season a date string (YYYY-MM-DD) belongs to.
 * Returns the matching seasonId or null.
 */
export function getSeasonForDate(dateStr, seasonIds = []) {
  if (!dateStr) return null;
  const ts = Math.floor(new Date(dateStr + 'T12:00:00').getTime() / 1000);
  return getSeasonForTimestamp(ts, seasonIds);
}

/**
 * Determine which season an event belongs to based on its Unix timestamp.
 * Checks a list of known season IDs and returns the matching one, or null.
 */
export function getSeasonForTimestamp(timestamp, seasonIds = []) {
  for (const seasonId of seasonIds) {
    const range = getSeasonDateRange(seasonId);
    if (timestamp >= range.startTimestamp && timestamp <= range.endTimestamp) {
      return seasonId;
    }
  }
  return null;
}

/**
 * Filter an events object { upcoming: [], past: [] } to only include events
 * within the given season's date range.
 */
export function filterEventsBySeason(events, seasonId) {
  if (!seasonId) return events;
  const range = getSeasonDateRange(seasonId);

  const filterList = (list) =>
    list.filter((e) => e.timestamp >= range.startTimestamp && e.timestamp <= range.endTimestamp);

  return {
    upcoming: filterList(events.upcoming || []),
    past: filterList(events.past || []),
  };
}
