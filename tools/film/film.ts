// The game film, run on the coach's PC against the manager's Supabase project (settings: tools/film/common.ts).
//
//   npm run film -- teams                   lists the manager's teams and their ids (for .manager.json teamId)
//   npm run film -- roster [--dry-run]      updates data/roster.json from the team's players (names and numbers;
//                                           positions stay as they are) and renames players in lineups.json
//   npm run film -- publish [--dry-run]     validates, then writes every game, breakdown, lineup, position and
//                                           Ollie game into the film tables, links each game to its schedule
//                                           entry, and uploads the highlight clips to the private R2 bucket
//   npm run film -- stats [--dry-run]       each player's season numbers (minutes, starts, positions, goals,
//                                           assists, shots, cards) from the lineups, the scorekeeper and Ollie,
//                                           into player_season_stats
//   npm run film -- keeper games            lists every game the scorekeeper has logged (keeper_entries)
//   npm run film -- keeper pull <game> [--as <slug>] [--force]
//                                           writes data/raw/<slug>-live.json (moments, numbers, lineup) and, once
//                                           data/games/<slug>.json exists, the game's lineup in lineups.json
//   npm run film -- keeper forget <game>    removes a whole game from the scorekeeper's log (a test or duplicate)
//   npm run film -- move-keeper [--dry-run] one time: opens the old encrypted stat logs (keeper_log) with the
//                                           scorekeeper password (private/film/.keeper-password) and copies them
//                                           into keeper_entries; safe to run again
//   npm run film -- check                   the project, the team, and what the film tables hold
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { replay, toRaw } from "../../src/film/lib/keeplog";
import { halfLengths, playLineup } from "../../src/film/lib/lineup";
import { fromKeeper, fromLibrary, fromOllie, seasonStats, type SourceGame } from "../../src/film/lib/playerStats";
import { matchGame } from "../../src/film/lib/schedule";
import { sec } from "../../src/film/lib/time";
import { KeepEntry, Lineups, OllieHistory, OlliePlayers, Roster, type Game, type Lineup, type PublicGame } from "../../src/film/schema";
import { DATA, PRIVATE, ROOT, admin, dataJson, fail, needTeam, readSecret, scheduleOf, settings, team } from "./common";
import { deriveKeeperKeys, openEntry } from "./keeperCrypto";
import { clipsClient, loadClipsR2 } from "./r2";
import { formatRoster, mergeRoster, renameInJson, type ManagerPlayer } from "./rosterMerge";

const [cmd, ...args] = process.argv.slice(2);
const dry = args.includes("--dry-run");
const KEEPER_KDF = JSON.parse(readFileSync(join(ROOT, "tools", "film", "keeper-kdf.json"), "utf8")) as { salt: string; iterations: number };

const gameFiles = <T>() => readdirSync(join(DATA, "games")).filter(f => f.endsWith(".json")).sort()
  .map(f => JSON.parse(readFileSync(join(DATA, "games", f), "utf8")) as T);

// One game's block in lineups.json, in the file's hand-kept style: one starter or change per line.
const line = (o: object) => JSON.stringify(o).replace(/^\{/, "{ ").replace(/\}$/, " }").replace(/","/g, '", "').replace(/":/g, '": ').replace(/,"/g, ', "');
function lineupBlock(slug: string, l: Lineup) {
  const list = (xs: object[]) => (xs.length ? `[\n${xs.map(x => `        ${line(x)}`).join(",\n")}\n      ]` : "[]");
  return `    ${JSON.stringify(slug)}: {\n      "start": ${list(l.start)},\n      "changes": ${list(l.changes)}\n    }`;
}

/** Puts a game's lineup into lineups.json text, replacing that game's block if it has one. */
function spliceLineup(text: string, slug: string, l: Lineup): string {
  const games = text.indexOf('"games"');
  if (games < 0) fail("lineups.json has no \"games\" object");
  const key = text.indexOf(`\n    ${JSON.stringify(slug)}: {`, games);
  if (key >= 0) {
    let depth = 0, i = text.indexOf("{", key);
    for (; i < text.length; i++) { if (text[i] === "{") depth++; else if (text[i] === "}" && --depth === 0) break; }
    return text.slice(0, key + 1) + lineupBlock(slug, l) + text.slice(i + 1);
  }
  const close = text.lastIndexOf("\n  }");
  const before = text.slice(0, close).trimEnd();
  const empty = before.endsWith("{");
  return `${before}${empty ? "" : ","}\n${lineupBlock(slug, l)}${text.slice(close)}`;
}

if (cmd === "teams") {
  const s = settings();
  const { data, error } = await admin(s).from("teams").select("id, name, age_group, gender, status").order("name");
  if (error) fail(error.message);
  for (const t of data ?? []) console.log(`${t.id}  ${t.name}${t.age_group ? ` · ${t.age_group}` : ""}${t.gender ? ` · ${t.gender}` : ""}${t.status && t.status !== "active" ? ` (${t.status})` : ""}`);
} else if (cmd === "roster") {
  const s = settings();
  const teamId = needTeam(s);
  const db = admin(s);
  const t = await team(db, teamId);
  const { data, error } = await db.from("players").select("id, first_name, last_name, jersey_number, status").eq("team_id", teamId);
  if (error) fail(error.message);
  const file = join(DATA, "roster.json");
  const current = existsSync(file) ? Roster.parse(JSON.parse(readFileSync(file, "utf8"))) : { players: [] };
  const m = mergeRoster(current, (data ?? []) as ManagerPlayer[]);
  console.log(`${t.name}: ${(data ?? []).filter(p => p.status === "active").length} active players in the manager`);
  for (const n of m.added) console.log(`  + ${n} (add their positions in roster.json)`);
  for (const [a, b] of m.renamed) console.log(`  ~ ${a} → ${b}`);
  for (const [n, a, b] of m.renumbered) console.log(`  # ${n}: ${a ?? "—"} → ${b ?? "—"}`);
  for (const n of m.notListed) console.log(`  ? ${n} isn't an active player in the manager (kept: old games name them)`);
  if (dry) { console.log("(dry run: nothing written)"); process.exit(0); }
  writeFileSync(file, formatRoster(m.roster));
  const lineups = join(DATA, "lineups.json");
  if (m.renamed.length && existsSync(lineups)) writeFileSync(lineups, renameInJson(readFileSync(lineups, "utf8"), m.renamed));
  console.log(`✓ wrote ${file}${m.renamed.length ? " and renamed players in lineups.json" : ""}. Run npm run film:validate.`);
} else if (cmd === "stats") {
  const s = settings();
  const teamId = needTeam(s);
  const db = admin(s);
  const t = await team(db, teamId);
  const roster = Roster.parse(dataJson("roster.json") ?? { players: [] });
  const lineups = dataJson("lineups.json") ? Lineups.parse(dataJson("lineups.json")) : null;
  const sources: SourceGame[] = fromLibrary(gameFiles<PublicGame>(), lineups);
  console.log(`lineups: ${sources.length} games`);
  const native = await db.from("keeper_entries").select("game, entry").eq("team_id", teamId).order("created_at");
  if (native.error) console.warn(`  scorekeeper: ${native.error.message} (left out)`);
  else {
    const byGame = new Map<string, KeepEntry[]>();
    for (const r of native.data ?? []) {
      const e = KeepEntry.safeParse(r.entry);
      if (e.success) byGame.set(r.game as string, [...(byGame.get(r.game as string) ?? []), e.data]);
    }
    const kept = fromKeeper([...byGame.values()]);
    sources.push(...kept);
    console.log(`scorekeeper: ${kept.length} games`);
  }
  const history = dataJson("ollie/history.json"), olliePlayers = dataJson("ollie/players.json");
  if (history && olliePlayers) {
    const o = fromOllie(OllieHistory.parse(history).games, OlliePlayers.parse(olliePlayers), roster);
    sources.push(...o.games);
    console.log(`Ollie: ${o.games.length} games with player stats${o.unknown.length ? ` (not on the roster: ${o.unknown.join(", ")})` : ""}`);
  }
  const bySeason = seasonStats(sources, roster.players.map(p => p.name));
  const { data: seasonRows } = await db.from("seasons").select("id");
  const known = new Set((seasonRows ?? []).map(r => r.id as string));
  const rows = [];
  for (const [season, players] of [...bySeason].sort()) {
    if (!known.has(season)) { console.log(`  ${season}: not a season in the manager; skipped`); continue; }
    console.log(`  ${season}`);
    for (const p of roster.players) {
      const st = players.get(p.name);
      if (!st) continue;
      if (!p.managerId) { console.log(`    ${p.name}: no manager record (run roster); skipped`); continue; }
      console.log(`    ${p.name}: ${st.games} games, ${st.minutes}/${st.available} min, ${st.starts} starts, ${st.goals} G ${st.assists} A ${st.shots} shots${st.positions.length ? ` · ${st.positions.slice(0, 3).map(x => x.pos).join("/")}` : ""}`);
      rows.push({ player_id: p.managerId, season_id: season, team_id: teamId, stats: st, updated_at: new Date().toISOString() });
    }
  }
  if (dry) { console.log("(dry run: nothing written)"); process.exit(0); }
  if (rows.length) {
    const { error } = await db.from("player_season_stats").upsert(rows, { onConflict: "player_id,season_id,team_id" });
    if (error) fail(`${error.message}. Run sql/player_season_stats_migration.sql first.`);
  }
  console.log(`✓ ${t.name}: ${rows.length} player seasons written.`);
} else if (cmd === "publish") {
  const s = settings();
  const teamId = needTeam(s);
  const db = admin(s);
  const t = await team(db, teamId);
  const v = spawnSync(process.execPath, [join(ROOT, "node_modules", "tsx", "dist", "cli.mjs"), join(ROOT, "tools", "film", "validate.ts")], { stdio: "inherit" });
  if (v.status !== 0) fail("Validation failed; nothing was published.");
  const site = dataJson("site.json") as { us: string };
  const roster = Roster.parse(dataJson("roster.json") ?? { players: [] });
  const lineups = dataJson("lineups.json") ? Lineups.parse(dataJson("lineups.json")) : null;
  const games = gameFiles<Game>();
  const schedule = await scheduleOf(db, s, teamId, t.name);
  const now = new Date().toISOString();

  // Lineups name players by roster name; the manager keeps them by player id where there is one.
  const idOf = new Map(roster.players.filter(p => p.managerId).map(p => [p.name, p.managerId!]));
  const unlinked = new Set<string>();
  const byId = (name: string) => idOf.get(name) ?? (unlinked.add(name), name);
  const toIds = (l: { start: { pos: string; player: string }[]; changes?: Lineup["changes"]; estimated?: boolean }) => ({
    ...l,
    start: l.start.map(x => ({ ...x, player: byId(x.player) })),
    ...(l.changes ? {
      changes: l.changes.map(c => ("off" in c ? { ...c, off: byId(c.off), on: byId(c.on) } : { ...c, player: byId(c.player) })),
    } : {}),
  });

  const gameRows = games.map(g => {
    const m = matchGame(g, schedule);
    console.log(m ? `  ✓ ${g.date} ${g.opponent} → ${m.title || "(untitled)"}` : `  ? ${g.date} ${g.opponent}: no game in the schedule that day (published, but not linked)`);
    const { coaches: _coaches, ...pub } = g;
    return {
      team_id: teamId, slug: g.slug, event_id: m?.eventId ?? null, game_date: g.date, game_time: g.time,
      opponent: g.opponent, home: g.home, score_us: g.score.us, score_them: g.score.them,
      has_highlights: g.highlights.clips.length > 0,
      // The full-game video's path is on this PC only.
      content: { ...pub, highlights: { ...pub.highlights, source: "" } },
      updated_at: now,
    };
  });
  const breakdownRows = games.map(g => ({ team_id: teamId, slug: g.slug, content: g.coaches, updated_at: now }));
  const positionRows = roster.players.filter(p => p.managerId)
    .map(p => ({ team_id: teamId, player_id: p.managerId, positions: p.positions, updated_at: now }));
  const lineupRows = [
    ...(lineups?.default ? [{ team_id: teamId, slug: "*", lineup: toIds({ ...lineups.default, changes: [] }), updated_at: now }] : []),
    ...Object.entries(lineups?.games ?? {}).map(([slug, l]) => ({ team_id: teamId, slug, lineup: toIds(l), updated_at: now })),
  ];
  const history = dataJson("ollie/history.json") ? OllieHistory.parse(dataJson("ollie/history.json")) : null;
  const olliePlayers = dataJson("ollie/players.json") ? OlliePlayers.parse(dataJson("ollie/players.json")) : null;
  const ollieRows = (history?.games ?? []).map(o => ({ team_id: teamId, ollie_id: o.id, game_date: o.date, content: o, updated_at: now }));
  const olliePlayerRows = Object.entries(olliePlayers?.games ?? {})
    .filter(([id]) => ollieRows.some(r => r.ollie_id === id))
    .map(([id, players]) => ({ team_id: teamId, ollie_id: id, players, updated_at: now }));

  for (const n of unlinked) console.log(`  ? ${n} is in lineups.json but has no manager record (run roster); kept by name`);
  console.log(`${t.name}: ${gameRows.length} games, ${positionRows.length} players' positions, ${lineupRows.length} lineups, ${ollieRows.length} Ollie games`);

  // Clips: plain MP4s in the private bucket, under the team's id.
  let r2c: ReturnType<typeof loadClipsR2> = null;
  try { r2c = loadClipsR2(join(PRIVATE, ".r2.json")); } catch (e) { fail((e as Error).message); }
  const clipKeys = new Map<string, string>();
  for (const g of games) for (const c of g.highlights.clips) clipKeys.set(`${teamId}/${g.slug}/${c.id}.mp4`, join(PRIVATE, "clips", g.slug, `${c.id}.mp4`));
  if (!r2c && clipKeys.size) console.log(`  • no clipsBucket in private/film/.r2.json: ${clipKeys.size} clips not uploaded`);
  if (dry) { console.log("(dry run: nothing written)"); process.exit(0); }

  const up = async (table: string, rows: object[], onConflict: string) => {
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await db.from(table).upsert(rows.slice(i, i + 200), { onConflict });
      if (error) fail(`${table}: ${error.message}. Run sql/film_native_migration.sql first.`);
    }
  };
  // Whatever isn't in this publish any more comes off the manager too.
  const prune = async (table: string, col: string, keep: string[]) => {
    const { data, error } = await db.from(table).select(col).eq("team_id", teamId);
    if (error) fail(`${table}: ${error.message}`);
    const gone = (data ?? []).map(r => (r as unknown as Record<string, string>)[col]).filter(x => !keep.includes(x));
    if (gone.length) await db.from(table).delete().eq("team_id", teamId).in(col, gone);
    return gone.length;
  };

  await up("film_teams", [{ team_id: teamId, short_name: site.us, updated_at: now }], "team_id");
  await up("film_games", gameRows, "team_id,slug");
  await up("film_breakdowns", breakdownRows, "team_id,slug");
  await up("film_positions", positionRows, "team_id,player_id");
  await up("film_lineups", lineupRows, "team_id,slug");
  await up("film_ollie_games", ollieRows, "team_id,ollie_id");
  await up("film_ollie_players", olliePlayerRows, "team_id,ollie_id");
  const removed = await prune("film_games", "slug", gameRows.map(r => r.slug));
  await prune("film_lineups", "slug", lineupRows.map(r => r.slug));
  await prune("film_ollie_games", "ollie_id", ollieRows.map(r => r.ollie_id));

  let uploaded = 0, clipsGone = 0;
  if (r2c) {
    const r2 = clipsClient(r2c);
    const inBucket = await r2.list(`${teamId}/`).catch((e: Error) => fail(`Couldn't reach the clips bucket (${e.name}). Check private/film/.r2.json.`));
    for (const [key, src] of clipKeys) {
      if (!existsSync(src)) fail(`Missing clip ${src}. Run python tools/film/make_highlights.py for that game.`);
      if (await r2.put(key, readFileSync(src), inBucket)) uploaded++;
    }
    clipsGone = await r2.remove([...inBucket.keys()].filter(k => !clipKeys.has(k)));
  }
  console.log(`✓ ${t.name}: published ${gameRows.length} games${removed ? `, ${removed} removed` : ""}; clips: ${uploaded} uploaded, ${clipKeys.size - uploaded} unchanged${clipsGone ? `, ${clipsGone} removed` : ""}.`);
} else if (cmd === "keeper") {
  const [sub, game] = args;
  const s = settings();
  const teamId = needTeam(s);
  const db = admin(s);
  // The scorekeeper's log, grouped by game.
  const { data, error } = await db.from("keeper_entries").select("id, game, entry").eq("team_id", teamId).order("created_at");
  if (error) fail(`keeper_entries: ${error.message}`);
  const byGame = new Map<string, KeepEntry[]>();
  for (const r of data ?? []) {
    const e = KeepEntry.safeParse(r.entry);
    if (e.success) byGame.set(r.game as string, [...(byGame.get(r.game as string) ?? []), e.data]);
  }
  if (sub === "games") {
    if (!byGame.size) console.log("No games in the scorekeeper's log yet.");
    for (const [slug, entries] of [...byGame].sort()) {
      const st = replay(entries);
      console.log(`${slug}  ${st.setup ? `${st.setup.format}v${st.setup.format}  ` : ""}${st.score.us}–${st.score.them} ${st.setup?.opponent ?? ""}  ${st.phase}  ${entries.length} entries`);
    }
  } else if (sub === "pull") {
    const slug = game ?? fail("usage: npm run film -- keeper pull <game> [--as <slug>] [--force]");
    const asIdx = args.indexOf("--as");
    const target = asIdx >= 0 ? args[asIdx + 1] ?? fail("--as needs the game's slug") : slug;
    const force = args.includes("--force");
    const entries = byGame.get(slug) ?? fail(`No game ${slug} in the scorekeeper's log. Run: npm run film -- keeper games`);
    const st = replay(entries);
    const site = dataJson("site.json") as { us: string };
    const raw = { ...toRaw(st, site.us), slug: target, keeperSlug: slug };
    const rawDir = join(DATA, "raw");
    mkdirSync(rawDir, { recursive: true });
    const rawFile = join(rawDir, `${target}-live.json`);
    writeFileSync(rawFile, JSON.stringify(raw, null, 1) + "\n");
    console.log(`wrote ${rawFile}: ${raw.score.us}–${raw.score.them}, ${raw.events.length} moments, ${raw.lineup.changes.length} lineup changes${st.phase === "done" ? "" : ` (the game isn't at full time yet: ${st.phase})`}`);
    for (const e of st.errors) console.warn(`  ! ${e}`);
    const gameFile = join(DATA, "games", `${target}.json`);
    if (!existsSync(gameFile)) {
      console.log(`No ${target}.json game file yet, so lineups.json is unchanged. Run pull again once the game file exists.`);
    } else if (!raw.lineup.start.length) {
      console.log("The log has no starters, so lineups.json is unchanged.");
    } else {
      const g = JSON.parse(readFileSync(gameFile, "utf8"));
      // The validator replays the lineup against the tape's half lengths; a change past them would fail it.
      const len = halfLengths(g);
      for (const c of raw.lineup.changes) if (sec(c.c) > len[c.h]) console.warn(`  ! ${c.h}H ${c.c}: after the half ends on the tape (${g.video.halfLength[c.h]}); adjust it in lineups.json`);
      for (const e of playLineup(raw.lineup, len).errors) console.warn(`  ! ${e}`);
      const LINEUPS = join(DATA, "lineups.json");
      const text = existsSync(LINEUPS) ? readFileSync(LINEUPS, "utf8") : '{\n  "games": {\n  }\n}\n';
      const current = Lineups.parse(JSON.parse(text));
      const had = current.games[target];
      if (had?.start.length && !had.estimated && !force) fail(`lineups.json already has a confirmed lineup for ${target}. Add --force to replace it.`);
      const next = spliceLineup(text, target, raw.lineup);
      Lineups.parse(JSON.parse(next));
      writeFileSync(LINEUPS, next);
      console.log(`${had ? "replaced" : "added"} ${target} in ${LINEUPS} (${raw.lineup.start.length} starters, ${raw.lineup.changes.length} changes). Run npm run film:validate.`);
    }
  } else if (sub === "forget") {
    const slug = game ?? fail("usage: npm run film -- keeper forget <game>");
    if (!byGame.has(slug)) fail(`No game ${slug} in the scorekeeper's log. Run: npm run film -- keeper games`);
    const { error: e, count } = await db.from("keeper_entries").delete({ count: "exact" }).eq("team_id", teamId).eq("game", slug);
    if (e) fail(e.message);
    console.log(`removed ${slug}: ${count} entries`);
  } else {
    fail("usage: npm run film -- keeper games | pull <game> [--as <slug>] [--force] | forget <game>");
  }
} else if (cmd === "move-keeper") {
  const s = settings();
  const teamId = needTeam(s);
  const db = admin(s);
  // The encrypted stat logs (keeper_log), opened with the scorekeeper password and copied into keeper_entries,
  // one row per entry under its game. Same ids, so running it again adds nothing twice.
  const k = await deriveKeeperKeys(readSecret(".keeper-password"), KEEPER_KDF);
  let { data, error } = await db.from("keeper_log").select("scope, data, created_by").or(`team_id.eq.${teamId},team_id.is.null`);
  if (error && /team_id|created_by/.test(error.message)) ({ data, error } = await db.from("keeper_log").select("scope, data"));
  if (error) fail(`keeper_log: ${error.message}`);
  const byScope = new Map<string, { e: KeepEntry; by: string | null }[]>();
  let skipped = 0;
  for (const r of (data ?? []) as { scope: string; data: string; created_by?: string | null }[]) {
    const e = await openEntry(k.encRaw, r.data).then(x => KeepEntry.parse(x), () => null);
    if (!e) { skipped++; continue; }
    byScope.set(r.scope, [...(byScope.get(r.scope) ?? []), { e, by: r.created_by ?? null }]);
  }
  const rows = [];
  for (const list of byScope.values()) {
    const setup = list.find(x => x.e.k === "setup")?.e;
    const game = setup && setup.k === "setup" ? setup.setup.slug : null;
    if (!game) { skipped += list.length; continue; }
    for (const { e, by } of list) rows.push({ id: e.id, team_id: teamId, game, entry: e, created_by: by, created_at: new Date(e.at).toISOString() });
  }
  console.log(`${rows.length} entries in ${byScope.size} games${skipped ? ` (${skipped} not readable with this password or without a game; skipped)` : ""}`);
  if (dry) { console.log("(dry run: nothing written)"); process.exit(0); }
  for (let i = 0; i < rows.length; i += 500) {
    const { error: e } = await db.from("keeper_entries").upsert(rows.slice(i, i + 500), { onConflict: "id", ignoreDuplicates: true });
    if (e) fail(`keeper_entries: ${e.message}. Run sql/keeper_native_migration.sql first.`);
  }
  console.log(`✓ ${rows.length} scorekeeper entries moved into the manager.`);
} else if (cmd === "check") {
  const s = settings();
  const db = admin(s);
  const teamId = needTeam(s);
  const t = await team(db, teamId);
  console.log(`✓ project reachable; team ${t.name}`);
  for (const table of ["film_games", "film_breakdowns", "film_lineups", "film_notes", "keeper_entries"]) {
    const { count, error } = await db.from(table).select("*", { count: "exact", head: true }).eq("team_id", teamId);
    console.log(error ? `✗ ${table}: ${error.message}` : `✓ ${table}: ${count} rows`);
  }
  let r2c: ReturnType<typeof loadClipsR2> = null;
  try { r2c = loadClipsR2(join(PRIVATE, ".r2.json")); } catch (e) { console.log(`✗ clips bucket: ${(e as Error).message}`); }
  if (r2c) {
    const n = await clipsClient(r2c).list(`${teamId}/`).then(m => m.size, (e: Error) => { console.log(`✗ clips bucket: ${e.name}`); return null; });
    if (n != null) console.log(`✓ clips bucket: ${n} clips`);
  }
} else {
  fail("usage: npm run film -- teams | roster [--dry-run] | publish [--dry-run] | stats [--dry-run] | keeper games|pull|forget | move-keeper [--dry-run] | check");
}
