// Compliance (medical release + ReePlayer waiver) is tracked PER SEASON:
// each season requires its own waiver. These helpers resolve a player's
// compliance for a specific season from their seasonProfiles map.

export function getCompliance(player, seasonId) {
  const sp = (seasonId && player?.seasonProfiles?.[seasonId]) || {};
  return {
    medicalRelease: sp.medicalRelease === true,
    reePlayerWaiver: sp.reePlayerWaiver === true,
  };
}

export function isFullyCompliant(player, seasonId) {
  const c = getCompliance(player, seasonId);
  return c.medicalRelease && c.reePlayerWaiver;
}
