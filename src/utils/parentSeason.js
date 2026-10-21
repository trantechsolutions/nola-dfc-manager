// A parent's season is known only after these resolve in order: their players (which give the team), the
// team itself (which gives its active season), the season hook applying that season, and then that team and
// season's data (players, money, checklist, team seasons, schedule). App.jsx holds the page on the loading
// screen until all of it is in, so a parent never sees another season's page first and watches it flip.

/** The team id the parent-team effect will settle on, from what's loaded right now. */
export function expectedParentTeamId({ viewingAsParent, impersonatingAs, isStaff, selectedTeamId, players, email }) {
  if (viewingAsParent) return impersonatingAs?.teamId || null;
  if (isStaff || selectedTeamId) return null;
  const me = (email || '').toLowerCase();
  const mine = (players || []).find((p) => p.teamId && p.guardians?.some((g) => g.email?.toLowerCase() === me));
  return mine?.teamId || null;
}

/**
 * True once the team fetch for parentTeamId finished, the season shown is its active one (or it has none),
 * and every season-scoped load has finished for that team and season. `loaded` holds what each load was
 * last for: data and checklist as `${teamId}|${season}`, teamSeasons and schedule as the team id.
 */
export function isParentSeasonSettled({ parentTeamId, loadedFor, parentTeam, selectedSeason, loaded = {} }) {
  if (!parentTeamId || loadedFor !== parentTeamId) return false;
  const team = parentTeam?.id === parentTeamId ? parentTeam : null;
  if (team?.activeSeasonId && selectedSeason !== team.activeSeasonId) return false;
  const key = `${parentTeamId}|${selectedSeason}`;
  return (
    loaded.data === key &&
    loaded.checklist === key &&
    loaded.teamSeasons === parentTeamId &&
    // The schedule loads from the team object, so when the team couldn't be fetched it loads for none ('').
    loaded.schedule === (team ? parentTeamId : '')
  );
}

/**
 * Whether the parent page should still wait. Staff and signed-out users never wait; a parent waits for the
 * first data load (it finds their players), and a parent with no team stops waiting there.
 */
export function isParentSeasonPending({ signedIn, isStaff, firstLoadDone, parentTeamId, expectedTeamId, readyFor }) {
  if (!signedIn || isStaff) return false;
  if (!firstLoadDone || parentTeamId !== expectedTeamId) return true;
  return !!parentTeamId && readyFor !== parentTeamId;
}
