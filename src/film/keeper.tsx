// The scorekeeper's data, inside the manager: the squad and schedule come from the team, and the stat log is
// kept under the signed-in account (keeper_entries, sql/keeper_native_migration.sql). Same interface as the
// game film site's keeper.tsx, so the carried-over screen (pages/Keep.tsx) runs unchanged.
//
// Every tap is saved on this device first and sent whenever there's a connection, so a dead spot at the field
// loses nothing, and a second phone signed in to the same team picks the game up.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { supabase } from "../supabase";
import { KeepEntry, KeeperRoster, type ScheduledGame } from "./schema";
import { toSchedule, type ManagerEvent } from "./lib/schedule";
import { replay } from "./lib/keeplog";
import { isOpen, windowFor, type GameWindow } from "./gameWindow";

export { isOpen, windowFor };

// An unfinished practice run goes after an hour without a tap.
export const PRACTICE_IDLE_MS = 60 * 60 * 1000;

/** A practice run that hasn't reached full time. */
export const isUnfinishedPractice = (entries: KeepEntry[]) =>
  entries.some(e => e.k === "setup" && e.setup.practice) && replay(entries).phase !== "done";

/** No tap for an hour (or nothing logged at all). */
export const isIdle = (entries: KeepEntry[], now: number) =>
  now - Math.max(0, ...entries.map(e => e.at)) > PRACTICE_IDLE_MS;

/** Kept for the screen's sign-in path, which the manager doesn't use: the account is already signed in. */
export class BadKeeperPassword extends Error {}

/** "expired": the account can no longer keep stats for this team (the role was taken away). */
export type SyncState = "idle" | "sending" | "offline" | "error" | "expired";

interface Log { entries: KeepEntry[]; sent: Set<string> }

interface KeeperApi {
  signedIn: boolean;
  hasKeys: boolean;
  roster: KeeperRoster | null;
  signIn: (password: string) => Promise<void>;
  signOut: () => void;
  games: string[];
  entries: (slug: string) => KeepEntry[];
  append: (slug: string, e: KeepEntry) => void;
  refresh: () => Promise<void>;
  forget: (slug: string) => void;
  /** Deletes every unfinished practice run on this phone (starting a new one replaces the last). */
  clearPractice: () => void;
  /** A scheduled game's stat window, by its team_events id; null when it isn't a game in the schedule. */
  windowOf: (eventId: string | undefined) => GameWindow | null;
  /** The scheduled games whose stat window is open at `now`. */
  openGames: (now: number) => ScheduledGame[];
  sync: { state: SyncState; pending: number; error: string };
  version: number;
}

const Ctx = createContext<KeeperApi | null>(null);
export const useKeeper = () => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useKeeper outside KeeperProvider");
  return v;
};

const read = <T,>(k: string): T | null => { try { const s = localStorage.getItem(k); return s ? JSON.parse(s) : null; } catch { return null; } };
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage full or blocked: kept in memory */ } };
const drop = (k: string) => { try { localStorage.removeItem(k); } catch { /* nothing stored */ } };

const fullName = (p: { first_name?: string | null; last_name?: string | null }) =>
  `${p.first_name || ""} ${p.last_name || ""}`.replace(/\s+/g, " ").trim();
const jersey = (n: unknown) => { const x = Number(n); return n !== null && n !== "" && Number.isInteger(x) ? x : null; };

/** The squad (active players, their numbers and film positions), our short name and the team's games. */
async function fetchRoster(teamId: string, teamName: string): Promise<{ roster: KeeperRoster; windows: Record<string, GameWindow> }> {
  const [short, players, positions, events] = await Promise.all([
    supabase.from("film_teams").select("short_name").eq("team_id", teamId).maybeSingle(),
    supabase.from("players").select("id, first_name, last_name, jersey_number, status").eq("team_id", teamId),
    supabase.from("film_positions").select("player_id, positions").eq("team_id", teamId),
    supabase.from("team_events").select("id, title, location, event_date, end_date, event_type, is_cancelled, opponent, is_home").eq("team_id", teamId),
  ]);
  if (players.error) throw players.error;
  const posOf = new Map((positions.data ?? []).map(r => [r.player_id as string, (r.positions as string[]) || []]));
  const us = (short.data?.short_name as string) || teamName;
  const rows = (events.data ?? []) as (ManagerEvent & { opponent?: string | null; is_home?: boolean | null; end_date?: string | null })[];
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Chicago";
  // An event the app runs names its opponent and venue; a feed event is read from its title.
  const byId = new Map(rows.map(r => [r.id, r]));
  const schedule = toSchedule(rows, { timeZone, teamNames: [us, teamName] }).map(g => {
    const r = byId.get(g.eventId);
    return r?.opponent ? { ...g, opponent: r.opponent, home: r.is_home ?? g.home } : g;
  });
  const windows: Record<string, GameWindow> = {};
  for (const r of rows) if (r.event_date && !r.is_cancelled) windows[r.id] = windowFor(r.event_date, r.end_date);
  const roster = KeeperRoster.parse({
    us,
    players: (players.data ?? [])
      .filter(p => p.status === "active")
      .map(p => ({ name: fullName(p), number: jersey(p.jersey_number), positions: posOf.get(p.id) ?? [], managerId: p.id }))
      .filter(p => p.name)
      .sort((a, b) => a.name.localeCompare(b.name)),
    schedule,
  });
  return { roster, windows };
}

interface Row { game: string; entry: unknown }

export function KeeperProvider({ teamId, teamName, onLeave, children }: {
  teamId: string; teamName: string; onLeave: () => void; children: ReactNode;
}) {
  // Each team's logs are kept apart on the device.
  const K = useMemo(() => ({
    roster: `dfc-keeper-roster:${teamId}`,
    windows: `dfc-keeper-windows:${teamId}`,
    log: `dfc-keeper-log:${teamId}:`,
    index: `dfc-keeper-games:${teamId}`,
    forgot: `dfc-keeper-deleted:${teamId}`,
  }), [teamId]);
  const [roster, setRoster] = useState<KeeperRoster | null>(() => read<KeeperRoster>(K.roster));
  const [windows, setWindows] = useState<Record<string, GameWindow>>(() => read<Record<string, GameWindow>>(K.windows) ?? {});
  const [games, setGames] = useState<string[]>(() => read<string[]>(K.index) ?? []);
  const [version, setVersion] = useState(0);
  const [sync, setSync] = useState<KeeperApi["sync"]>({ state: "idle", pending: 0, error: "" });
  const logs = useRef(new Map<string, Log>());
  const busy = useRef(false);

  const logOf = useCallback((slug: string): Log => {
    let l = logs.current.get(slug);
    if (!l) {
      const s = read<{ entries: KeepEntry[]; sent: string[] }>(K.log + slug);
      l = { entries: s?.entries ?? [], sent: new Set(s?.sent ?? []) };
      logs.current.set(slug, l);
    }
    return l;
  }, [K]);
  const save = useCallback((slug: string, l: Log) => write(K.log + slug, { entries: l.entries, sent: [...l.sent] }), [K]);
  const addGame = useCallback((slug: string) => {
    setGames(g => {
      if (g.includes(slug)) return g;
      const next = [...g, slug].sort().reverse();
      write(K.index, next);
      return next;
    });
  }, [K]);
  const pendingCount = useCallback(() => {
    let n = 0;
    for (const slug of read<string[]>(K.index) ?? []) {
      const l = logOf(slug);
      if (l.entries.some(e => e.k === "setup" && e.setup.practice)) continue;
      n += l.entries.filter(e => !l.sent.has(e.id)).length;
    }
    return n;
  }, [K, logOf]);

  const isPractice = useCallback((slug: string) => !!logOf(slug).entries.find(e => e.k === "setup" && e.setup.practice), [logOf]);

  // Off this phone only: a practice run was never sent, so there's nothing to delete from the stat log.
  const discard = useCallback((slugs: string[]) => {
    if (!slugs.length) return;
    for (const slug of slugs) { logs.current.delete(slug); drop(K.log + slug); }
    setGames(g => { const next = g.filter(x => !slugs.includes(x)); write(K.index, next); return next; });
    setVersion(v => v + 1);
  }, [K]);
  const unfinishedPractice = useCallback(
    () => (read<string[]>(K.index) ?? []).filter(slug => isUnfinishedPractice(logOf(slug).entries)),
    [K, logOf],
  );

  // Unfinished practice runs left idle for an hour go, checked on opening and every minute.
  useEffect(() => {
    const sweep = () => discard(unfinishedPractice().filter(slug => isIdle(logOf(slug).entries, Date.now())));
    sweep();
    const t = setInterval(sweep, 60000);
    return () => clearInterval(t);
  }, [discard, unfinishedPractice, logOf]);

  // The squad refreshes quietly on every visit; offline, the stored one stays.
  useEffect(() => {
    let live = true;
    fetchRoster(teamId, teamName).then(
      r => { if (live) { setRoster(r.roster); write(K.roster, r.roster); setWindows(r.windows); write(K.windows, r.windows); } },
      err => console.warn("[keeper] squad:", err?.message ?? err),
    );
    return () => { live = false; };
  }, [teamId, teamName, K]);

  const denied = (code?: string) => code === "42501";

  const flush = useCallback(async () => {
    if (busy.current) return;
    // Deleted games first, so nothing is re-sent for them and other phones stop pulling them back.
    const forgotten = read<string[]>(K.forgot) ?? [];
    if (forgotten.length && navigator.onLine) {
      const left: string[] = [];
      for (const slug of forgotten) {
        const { error } = await supabase.rpc("keeper_forget_game", { p_team_id: teamId, p_game: slug });
        if (error) left.push(slug);
      }
      if (left.length) write(K.forgot, left); else drop(K.forgot);
    }
    const todo: { slug: string; e: KeepEntry }[] = [];
    for (const slug of read<string[]>(K.index) ?? []) {
      if (isPractice(slug)) continue;
      const l = logOf(slug);
      for (const e of l.entries) if (!l.sent.has(e.id)) todo.push({ slug, e });
    }
    if (!todo.length) { setSync(s => ({ ...s, state: "idle", pending: 0, error: "" })); return; }
    if (!navigator.onLine) { setSync({ state: "offline", pending: todo.length, error: "" }); return; }
    busy.current = true;
    setSync({ state: "sending", pending: todo.length, error: "" });
    try {
      for (let i = 0; i < todo.length; i += 200) {
        const batch = todo.slice(i, i + 200);
        const rows = batch.map(({ slug, e }) => ({ id: e.id, team_id: teamId, game: slug, entry: e }));
        // A game's setup goes first, on its own: the database matches every later entry to its game's
        // scheduled window through it. An entry already sent (another phone, an unanswered try) is skipped.
        for (const part of [rows.filter(r => r.entry.k === "setup"), rows.filter(r => r.entry.k !== "setup")]) {
          if (!part.length) continue;
          const { error } = await supabase.from("keeper_entries").upsert(part, { onConflict: "id", ignoreDuplicates: true });
          if (error) throw Object.assign(new Error(error.message), { code: error.code });
        }
        for (const { slug, e } of batch) logOf(slug).sent.add(e.id);
        for (const slug of new Set(batch.map(b => b.slug))) save(slug, logOf(slug));
      }
      setSync({ state: "idle", pending: 0, error: "" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const state = denied((err as { code?: string }).code) ? "expired" : navigator.onLine && !/fetch/i.test(msg) ? "error" : "offline";
      setSync({ state, pending: pendingCount(), error: msg });
    } finally { busy.current = false; }
  }, [teamId, K, logOf, save, pendingCount, isPractice]);

  // Retry whatever is waiting: when the connection comes back, and every 15 s.
  useEffect(() => {
    flush();
    const on = () => flush();
    window.addEventListener("online", on);
    const t = setInterval(flush, 15000);
    return () => { window.removeEventListener("online", on); clearInterval(t); };
  }, [flush]);

  const refresh = useCallback(async () => {
    if (!navigator.onLine) return;
    const { data, error } = await supabase.from("keeper_entries").select("game, entry").eq("team_id", teamId).order("created_at");
    if (error) { setSync(s => ({ ...s, state: denied(error.code) ? "expired" : "error", error: error.message })); return; }
    const byGame = new Map<string, KeepEntry[]>();
    for (const r of (data ?? []) as Row[]) {
      const parsed = KeepEntry.safeParse(r.entry);
      if (parsed.success) byGame.set(r.game, [...(byGame.get(r.game) ?? []), parsed.data]);
    }
    let changed = false;
    const forgotten = read<string[]>(K.forgot) ?? [];
    for (const [slug, entries] of byGame) {
      if (forgotten.includes(slug)) continue;
      const l = logOf(slug);
      const have = new Set(l.entries.map(e => e.id));
      for (const e of entries) {
        l.sent.add(e.id);
        if (!have.has(e.id)) { l.entries.push(e); changed = true; }
      }
      save(slug, l);
      addGame(slug);
    }
    if (changed) setVersion(v => v + 1);
  }, [teamId, K, logOf, save, addGame]);

  const flushSoon = useRef<ReturnType<typeof setTimeout>>(undefined);
  const forget = useCallback((slug: string) => {
    if (isPractice(slug)) { discard([slug]); return; }
    write(K.forgot, [...new Set([...(read<string[]>(K.forgot) ?? []), slug])]);
    logs.current.delete(slug);
    drop(K.log + slug);
    setGames(g => { const next = g.filter(x => x !== slug); write(K.index, next); return next; });
    setVersion(v => v + 1);
    clearTimeout(flushSoon.current);
    flushSoon.current = setTimeout(flush, 100);
  }, [K, flush, isPractice, discard]);
  const append = useCallback((slug: string, e: KeepEntry) => {
    const l = logOf(slug);
    l.entries.push(KeepEntry.parse(e));
    save(slug, l);
    addGame(slug);
    setVersion(v => v + 1);
    if (isPractice(slug)) return;
    setSync(s => ({ ...s, pending: s.pending + 1 }));
    clearTimeout(flushSoon.current);
    flushSoon.current = setTimeout(flush, 400);
  }, [logOf, save, addGame, flush, isPractice]);

  const api = useMemo<KeeperApi>(() => ({
    signedIn: !!roster, hasKeys: true, roster,
    signIn: async () => {},
    // "Sign out" leaves the scorekeeper; the logs stay on the device, sent or still waiting.
    signOut: onLeave,
    games, append, refresh, forget, sync, version,
    clearPractice: () => discard(unfinishedPractice()),
    windowOf: eventId => (eventId ? windows[eventId] ?? null : null),
    openGames: now => (roster?.schedule ?? []).filter(g => isOpen(windows[g.eventId], now)),
    entries: slug => logOf(slug).entries,
  }), [roster, onLeave, games, append, refresh, forget, sync, version, logOf, discard, unfinishedPractice, windows]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}
