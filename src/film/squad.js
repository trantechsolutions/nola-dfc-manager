// The squad and lineups as the film's logic (lib/lineup.ts, lib/naming.ts) reads them: players by name.
// The manager keeps lineups by player id (film_lineups, written by dfc-game-film's publish), so ids are
// swapped for names here; anything that isn't a known id (a guest with no manager record) stays as written.

export const playerName = (p) => `${p.first_name || ''} ${p.last_name || ''}`.replace(/\s+/g, ' ').trim();

const toNumber = (n) => {
  if (n === null || n === undefined || n === '') return null;
  const x = Number(n);
  return Number.isInteger(x) ? x : null;
};

/**
 * players: rows from players (id, first_name, last_name, jersey_number)
 * positions: rows from film_positions (player_id, positions)
 * lineupRows: rows from film_lineups (slug, lineup); slug '*' is the default starters
 * → { roster: { players: [{ name, number, positions, managerId }] }, lineups: { default?, games } }
 */
export function squadFrom(players, positions, lineupRows) {
  const byId = new Map(players.map((p) => [p.id, p]));
  const nameOf = (x) => (byId.has(x) ? playerName(byId.get(x)) : x);

  const roster = {
    players: positions
      .filter((r) => byId.has(r.player_id))
      .map((r) => {
        const p = byId.get(r.player_id);
        return {
          name: playerName(p),
          number: toNumber(p.jersey_number),
          positions: r.positions || [],
          managerId: p.id,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
  };

  const named = (l) => ({
    ...l,
    start: (l.start || []).map((s) => ({ ...s, player: nameOf(s.player) })),
    changes: (l.changes || []).map((c) =>
      'off' in c ? { ...c, off: nameOf(c.off), on: nameOf(c.on) } : { ...c, player: nameOf(c.player) },
    ),
  });
  const lineups = { games: {} };
  for (const r of lineupRows) {
    if (r.slug === '*') lineups.default = { start: named(r.lineup).start };
    else lineups.games[r.slug] = named(r.lineup);
  }
  return { roster, lineups };
}
