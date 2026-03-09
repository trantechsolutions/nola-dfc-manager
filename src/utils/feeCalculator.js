// src/utils/feeCalculator.js
// 
// THE TEAM FEE IS NEVER STORED — it's always derived from three ingredients:
//   1. Total projected expenses (sum of budget line items)
//   2. Buffer percentage (contingency %)
//   3. Roster size (number of paying players)
//
// Formula: ceil((expenses × (1 + buffer/100)) / rosterSize / 50) × 50
// The /50 * 50 rounds up to the nearest $50 for clean fee amounts.

/**
 * Calculate the per-player team fee from budget ingredients.
 * @param {number} totalExpenses - Sum of all expense line items (fall + spring)
 * @param {number} bufferPercent - Contingency percentage (e.g., 5 = 5%)
 * @param {number} rosterSize - Number of paying (non-waived) players
 * @returns {number} Rounded fee per player
 */
export function calculateTeamFee(totalExpenses = 0, bufferPercent = 0, rosterSize = 0) {
  if (!rosterSize || rosterSize <= 0 || !totalExpenses || totalExpenses <= 0) return 0;
  const withBuffer = totalExpenses * (1 + (bufferPercent || 0) / 100);
  return Math.ceil(withBuffer / rosterSize / 50) * 50;
}

/**
 * Calculate the fee from a team_season record.
 * Convenience wrapper that pulls the ingredients from a team_season object.
 * @param {object} teamSeason - { totalProjectedExpenses, bufferPercent, expectedRosterSize }
 * @returns {number} Rounded fee per player
 */
export function calculateTeamFeeFromSeason(teamSeason) {
  if (!teamSeason) return 0;
  return calculateTeamFee(
    teamSeason.totalProjectedExpenses || 0,
    teamSeason.bufferPercent || 0,
    teamSeason.expectedRosterSize || 0
  );
}