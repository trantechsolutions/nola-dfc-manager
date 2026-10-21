import { supabase } from '../supabase';

// The team's game film site (dfc-game-film). film_access() (sql/game_film_migration.sql) returns the keys
// the signed-in user's place on the team allows; the links below hand them to the film in the URL
// fragment ("#unlock=…"), which the browser never sends to a server. The film stores them and replaces
// the address, so the keys don't stay in the tab's history.

const b64url = (s) =>
  btoa(unescape(encodeURIComponent(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

// Local testing: with VITE_FILM_SITE_URL set (e.g. http://localhost:8000/ for the film's `npm run preview`),
// `npm run dev` links to that copy of the film instead of the live one. Production builds ignore it.
const DEV_SITE_URL = (import.meta.env.DEV && import.meta.env.VITE_FILM_SITE_URL) || '';

/** The film link for one way in: the games ('film'), with the coach area when allowed, or the scorekeeper. */
export function filmLink(access, target = 'film', siteOverride = DEV_SITE_URL) {
  if (!access?.siteUrl) return null;
  const base = (siteOverride || access.siteUrl).replace(/#.*$/, '').replace(/\/?$/, '/');
  let payload;
  if (target === 'keeper') {
    if (!access.keeper) return null;
    // With the account's token (keeper_device_token), the scorekeeper's entries are sent as this user.
    payload = { v: 1, k: { ...access.keeper, ...(access.keeperToken ? { u: access.keeperToken } : {}) }, to: 'keep' };
  } else {
    payload = { v: 1, t: access.team, ...(access.coach ? { c: access.coach } : {}), to: 'season' };
  }
  return `${base}#unlock=${b64url(JSON.stringify(payload))}`;
}

/** One game's page on the film ('report' or 'highlights'), opened with the games key (and the coach area when allowed). */
export function filmGameLink(access, slug, page = 'report', siteOverride = DEV_SITE_URL) {
  if (!access?.siteUrl || !access.team || !slug) return null;
  const base = (siteOverride || access.siteUrl).replace(/#.*$/, '').replace(/\/?$/, '/');
  const payload = {
    v: 1,
    t: access.team,
    ...(access.coach ? { c: access.coach } : {}),
    to: 'game',
    g: slug,
    p: page === 'highlights' ? 'highlights' : 'report',
  };
  return `${base}#unlock=${b64url(JSON.stringify(payload))}`;
}

export const filmService = {
  /** { siteUrl, team, coach, keeper } or null when the team has no film site or the user isn't on it. */
  async getAccess(teamId) {
    if (!teamId) return null;
    const { data, error } = await supabase.rpc('film_access', { p_team_id: teamId });
    // A project without the migration yet: no film card, not an error screen.
    if (error) {
      if (error.code === 'PGRST202' || /film_access/.test(error.message || '')) return null;
      throw error;
    }
    return data || null;
  },

  /**
   * A token for this account to keep stats for the team (sql/keeper_accounts_migration.sql), or null when
   * the project doesn't have it yet; the scorekeeper then falls back to the scorekeeper password's key.
   */
  async keeperToken(teamId) {
    if (!teamId) return null;
    const { data, error } = await supabase.rpc('keeper_device_token', { p_team_id: teamId });
    if (error) {
      if (error.code === 'PGRST202' || /keeper_device_token/.test(error.message || '')) return null;
      throw error;
    }
    return data || null;
  },

  /** A player's season numbers from the game film (sql/player_season_stats_migration.sql), or null. */
  async getPlayerStats(playerId, seasonId) {
    if (!playerId || !seasonId) return null;
    const { data, error } = await supabase
      .from('player_season_stats')
      .select('stats, updated_at')
      .eq('player_id', playerId)
      .eq('season_id', seasonId)
      .order('updated_at', { ascending: false })
      .limit(1);
    if (error) {
      if (['42P01', 'PGRST205'].includes(error.code) || /player_season_stats/.test(error.message || '')) return null;
      throw error;
    }
    return data?.[0]?.stats || null;
  },

  /**
   * The team's games on the film site, by their game in the schedule (sql/game_film_games_migration.sql):
   * [{ slug, eventId, gameDate, hasHighlights }]. Empty before the migration or when the user isn't on the team.
   */
  async getGames(teamId) {
    if (!teamId) return [];
    const { data, error } = await supabase
      .from('film_games')
      .select('slug, event_id, game_date, has_highlights')
      .eq('team_id', teamId);
    if (error) {
      if (['42P01', 'PGRST205'].includes(error.code) || /film_games/.test(error.message || '')) return [];
      throw error;
    }
    return (data || []).map((g) => ({
      slug: g.slug,
      eventId: g.event_id,
      gameDate: g.game_date,
      hasHighlights: !!g.has_highlights,
    }));
  },
};
