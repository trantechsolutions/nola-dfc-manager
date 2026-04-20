/**
 * Calculate US Soccer age group from birthdate and season.
 *
 * Two regimes are supported:
 *  - Seasons through 2025-2026: legacy **birth-year** rule (age = seasonEndYear - birthYear).
 *  - Seasons 2026-2027 and later: **school-year** rule (Aug 1 - Jul 31). Players born
 *    Aug-Dec are shifted into the following effective year so the resulting U-number
 *    matches the official USSF age-group chart.
 *
 * US Soccer announced the reversion to school-year registration effective Fall 2026.
 *
 * @param {string} birthdate – ISO date string (YYYY-MM-DD)
 * @param {string} seasonId  – season identifier like "2025-2026"
 * @returns {string|null}    – e.g. "U12", "U8", or null if invalid
 */
export function getUSAgeGroup(birthdate, seasonId) {
  if (!birthdate) return null;

  // Parse YYYY-MM-DD components directly to avoid timezone shifts that would
  // move Aug-1 births back to Jul-31 in negative-UTC-offset locales.
  const isoMatch = typeof birthdate === 'string' && birthdate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  let birthYear;
  let birthMonth;
  if (isoMatch) {
    birthYear = parseInt(isoMatch[1], 10);
    birthMonth = parseInt(isoMatch[2], 10);
  } else {
    const birth = new Date(birthdate);
    if (isNaN(birth.getTime())) return null;
    birthYear = birth.getFullYear();
    birthMonth = birth.getMonth() + 1;
  }
  if (isNaN(birthYear)) return null;

  let startYear;
  let endYear;
  const parts = seasonId?.match(/(\d{4})\s*[-–]\s*(\d{4})/);
  if (parts) {
    startYear = parseInt(parts[1], 10);
    endYear = parseInt(parts[2], 10);
  } else {
    // Fallback: derive current season on the Aug-Jul cycle.
    const now = new Date();
    const y = now.getFullYear();
    if (now.getMonth() >= 7) {
      startYear = y;
      endYear = y + 1;
    } else {
      startYear = y - 1;
      endYear = y;
    }
  }

  let age;
  if (startYear >= 2026) {
    // School-year regime: Aug-Dec births shift forward one effective year.
    const effectiveYear = birthMonth >= 8 ? birthYear + 1 : birthYear;
    age = endYear - effectiveYear;
  } else {
    // Legacy birth-year regime.
    age = endYear - birthYear;
  }

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
