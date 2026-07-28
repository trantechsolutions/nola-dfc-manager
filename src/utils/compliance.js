// Compliance (medical release + ReePlayer waiver + club registration) is
// tracked PER SEASON: each season requires its own waivers. These helpers
// resolve a player's compliance for a specific season from their
// seasonProfiles map.

export function getCompliance(player, seasonId) {
  const sp = (seasonId && player?.seasonProfiles?.[seasonId]) || {};
  return {
    medicalRelease: sp.medicalRelease === true,
    reePlayerWaiver: sp.reePlayerWaiver === true,
    clubRegistration: sp.clubRegistration === true,
  };
}

export function isFullyCompliant(player, seasonId) {
  const c = getCompliance(player, seasonId);
  return Object.values(c).every(Boolean);
}
