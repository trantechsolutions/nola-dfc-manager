/**
 * Calculate US Soccer age group from birthdate and season.
 *
 * US Soccer uses **birth year** to determine age groups.
 * The reference year is the second year of the season
 * (e.g., for "2025-2026", the reference year is 2026).
 *
 * @param {string} birthdate – ISO date string (YYYY-MM-DD)
 * @param {string} seasonId  – season identifier like "2025-2026"
 * @returns {string|null}    – e.g. "U12", "U8", or null if invalid
 */
export function getUSAgeGroup(birthdate, seasonId) {
  if (!birthdate) return null;

  const birthYear = new Date(birthdate).getFullYear();
  if (isNaN(birthYear)) return null;

  // Extract the second year from the season id (e.g., "2025-2026" → 2026)
  let refYear;
  const parts = seasonId?.match(/(\d{4})\s*[-–]\s*(\d{4})/);
  if (parts) {
    refYear = parseInt(parts[2], 10);
  } else {
    // Fallback: use current year + 1
    refYear = new Date().getFullYear() + 1;
  }

  const age = refYear - birthYear;
  if (age < 4 || age > 19) return null;

  return `U${age}`;
}

/**
 * Calculate a player's current age from birthdate.
 *
 * @param {string} birthdate – ISO date string (YYYY-MM-DD)
 * @returns {number|null}
 */
export function getAge(birthdate) {
  if (!birthdate) return null;
  const birth = new Date(birthdate);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}
