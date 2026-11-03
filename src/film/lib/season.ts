// Season totals across every game: results, when goals come and the shot numbers (from the public
// game files), and recurring themes (from the coaches' breakdowns, coach password only).
// Possession, passes and turnovers come from the video estimates where a game has them (the tables
// tools/film/cv_game.py writes), else possession from Ollie: a parent taps Ollie live, and passes logged
// late and in a rush make possession come out shorter than it was.
import { IMPROVEMENT_AREAS, type ImprovementArea, type Priority, type Game, type PublicGame } from "../schema";
import { sec } from "./time";

export type Result = "W" | "D" | "L";
export const result = (us: number, them: number): Result => (us > them ? "W" : us < them ? "L" : "D");

type Pair = [us: number, them: number];

export interface GameLine {
  slug: string; date: string; opponent: string; home: boolean | null;
  us: number; them: number; htUs: number; htThem: number; result: Result;
  shots: Pair | null; onTarget: Pair | null; possession: Pair | null;
  passes: Pair | null; turnovers: Pair | null;
  fromVideo: boolean;                   // possession is the video estimate, not Ollie's
  unsure: boolean;                      // the model struggled to tell the kits apart; left out of averages
}

export const VIDEO_TABLE = "Ball and possession (estimated from the video)";
export const STRETCH_TABLE = "Possession by 5-minute stretch (estimated from the video)";

const table = (g: PublicGame, title: string) => g.report.numbers.tables.find(t => t.title?.en === title);

function videoStat(g: PublicGame, label: RegExp): Pair | null {
  const r = table(g, VIDEO_TABLE)?.rows.find(r => label.test(r.label.en.trim()));
  return r ? [r.us, r.them] : null;
}

// Stat tables are written per game with free-text labels ("Shots on goal", "On target", "Possession %"),
// so rows are matched by their English label. The first match wins: the first table is the full game.
const STAT: Record<"shots" | "onTarget" | "possession", RegExp> = {
  shots: /^shots$/i,
  onTarget: /\bon (goal|target)\b/i,
  possession: /possession/i,
};

export function statOf(g: PublicGame, kind: keyof typeof STAT): Pair | null {
  for (const tb of g.report.numbers.tables) {
    const r = tb.rows.find(r => STAT[kind].test(r.label.en.trim()));
    if (r) return [r.us, r.them];
  }
  return null;
}

export function gameLine(g: PublicGame): GameLine {
  const { us, them, htUs, htThem } = g.score;
  const video = videoStat(g, /^possession$/i);
  return {
    slug: g.slug, date: g.date, opponent: g.opponent, home: g.home,
    us, them, htUs, htThem, result: result(us, them),
    shots: statOf(g, "shots"), onTarget: statOf(g, "onTarget"), possession: video ?? statOf(g, "possession"),
    passes: videoStat(g, /^completed passes$/i), turnovers: videoStat(g, /^turnovers$/i), fromVideo: video !== null,
    unsure: table(g, VIDEO_TABLE)?.unsure === true,
  };
}

export interface Stretch {
  half: 1 | 2; from: number; to: number;  // minutes of the half
  dfc: number;                            // our average possession share in it, %
  games: number;                          // games with a video estimate for it
  low: number;                            // of those, games where we had under LOW% of the ball
}
export const LOW = 40;
/** Halves run 28 to 39 minutes; a stretch starting this late is stoppage time and folds into the one before. */
const LAST = 30;

/** Our possession in each 5-minute stretch of a half, averaged over the games with video estimates:
 *  where in a game the ball keeps getting away from us. Games where the model struggled with the kits are left out. */
export function stretches(games: PublicGame[]): Stretch[] {
  const by = new Map<string, { half: 1 | 2; from: number; to: number; shares: number[] }>();
  for (const g of games) {
    const tb = table(g, STRETCH_TABLE);
    if (!tb || tb.unsure) continue;
    // This game's share per stretch; a stoppage-time stretch is averaged into the one it folds into.
    const mine = new Map<string, { half: 1 | 2; from: number; to: number; us: number[] }>();
    for (const r of tb.rows) {
      const m = /^(1st|2nd) half (\d+)–(\d+)'$/.exec(r.label.en.trim());
      if (!m) continue;
      const half = m[1] === "1st" ? 1 : 2, from = Math.min(Number(m[2]), LAST), k = `${half}-${from}`;
      const st = mine.get(k) ?? { half, from, to: 0, us: [] };
      st.to = Math.max(st.to, Number(m[3]));
      st.us.push(r.us);
      mine.set(k, st);
    }
    for (const [k, st] of mine) {
      const all = by.get(k) ?? { half: st.half, from: st.from, to: 0, shares: [] };
      all.to = Math.max(all.to, st.to);
      all.shares.push(st.us.reduce((a, b) => a + b, 0) / st.us.length);
      by.set(k, all);
    }
  }
  return [...by.values()]
    .map(({ shares, ...st }) => ({
      ...st, games: shares.length, low: shares.filter(x => x < LOW).length,
      dfc: Math.round(shares.reduce((a, b) => a + b, 0) / shares.length),
    }))
    .sort((a, b) => a.half - b.half || a.from - b.from);
}

/** Goal-timing windows within each half, by the half's clock. */
export const WINDOWS = [[0, 10], [10, 20], [20, null]] as const;
const windowOf = (c: string) => Math.min(Math.floor(sec(c) / 600), WINDOWS.length - 1);

export const RECENT = 5;

export interface Season {
  lines: GameLine[];                    // oldest first
  record: Record<Result, number> & { gf: number; ga: number; cleanSheets: number; blanks: number };
  /** Goals for and against per half and window: timing[half - 1][window]. */
  timing: Pair[][];
  /** Final results grouped by the half-time state. */
  fromHalfTime: Record<"ahead" | "level" | "behind", Record<Result, number>>;
  /** Opponents met more than once, each with its games oldest first. */
  repeats: { opponent: string; lines: GameLine[] }[];
  /** Averages over the games that recorded the stat; video estimates the model was unsure of are left out. */
  avg: Record<"shots" | "onTarget" | "possession" | "passes" | "turnovers", Pair | null>;
  stretches: Stretch[];
}

export function season(games: PublicGame[]): Season {
  const sorted = [...games].sort((a, b) => a.date.localeCompare(b.date));
  const lines = sorted.map(gameLine);

  const record = { W: 0, D: 0, L: 0, gf: 0, ga: 0, cleanSheets: 0, blanks: 0 };
  const zero = (): Record<Result, number> => ({ W: 0, D: 0, L: 0 });
  const fromHalfTime = { ahead: zero(), level: zero(), behind: zero() };
  for (const l of lines) {
    record[l.result]++;
    record.gf += l.us; record.ga += l.them;
    if (l.them === 0) record.cleanSheets++;
    if (l.us === 0) record.blanks++;
    fromHalfTime[l.htUs > l.htThem ? "ahead" : l.htUs < l.htThem ? "behind" : "level"][l.result]++;
  }

  const timing: Pair[][] = [1, 2].map(() => WINDOWS.map((): Pair => [0, 0]));
  for (const g of sorted) for (const e of g.events) {
    if (e.y !== "Goal" || e.t === "N") continue;
    timing[e.h - 1][windowOf(e.c)][e.t === "D" ? 0 : 1]++;
  }

  const byOpp = new Map<string, GameLine[]>();
  for (const l of lines) byOpp.set(l.opponent, [...(byOpp.get(l.opponent) ?? []), l]);
  const repeats = [...byOpp].filter(([, ls]) => ls.length > 1).map(([opponent, lines]) => ({ opponent, lines }));

  const mean = (k: keyof Season["avg"]): Pair | null => {
    const video = k === "possession" || k === "passes" || k === "turnovers";
    const xs = lines.filter(l => !(video && l.unsure)).map(l => l[k]).filter((p): p is Pair => p !== null);
    if (!xs.length) return null;
    const r = (n: number) => Math.round((n / xs.length) * 10) / 10;
    return [r(xs.reduce((s, p) => s + p[0], 0)), r(xs.reduce((s, p) => s + p[1], 0))];
  };

  const avg = { shots: mean("shots"), onTarget: mean("onTarget"), possession: mean("possession"), passes: mean("passes"), turnovers: mean("turnovers") };
  return { lines, record, timing, fromHalfTime, repeats, avg, stretches: stretches(sorted) };
}

export interface Theme {
  area: ImprovementArea;
  highGames: number;                    // games with a high-priority fix in this area
  games: number;                        // games with any fix in this area
  recentHigh: number;                   // of the last RECENT games, how many had a high-priority fix here
  fixes: Record<Priority, number>;
  thirds: [defensive: number, middle: number, attacking: number]; // fixes per third of the field
}

/** Recurring themes from the coaches' breakdowns: what the high-priority fixes keep coming back to.
 *  Ranked by games with a high-priority fix, then by weighted fixes (high 3, medium 2, low 1). */
export function themes(games: { date: string; coaches: Game["coaches"] }[]): Theme[] {
  const sorted = [...games].sort((a, b) => a.date.localeCompare(b.date));
  const recentFrom = Math.max(0, sorted.length - RECENT);
  const weight = (t: Theme) => t.fixes.high * 3 + t.fixes.med * 2 + t.fixes.low;
  return IMPROVEMENT_AREAS.map((area): Theme => {
    const th: Theme = { area, highGames: 0, games: 0, recentHigh: 0, fixes: { high: 0, med: 0, low: 0 }, thirds: [0, 0, 0] };
    sorted.forEach((g, i) => {
      let any = false, high = false;
      g.coaches.thirds.blocks.forEach((b, third) => b.fixes.forEach(f => {
        if (f.area !== area) return;
        any = true; high ||= f.pri === "high";
        th.fixes[f.pri]++; th.thirds[third]++;
      }));
      if (any) th.games++;
      if (high) { th.highGames++; if (i >= recentFrom) th.recentHigh++; }
    });
    return th;
  }).filter(t => t.games > 0).sort((a, b) => b.highGames - a.highGames || weight(b) - weight(a) || b.recentHigh - a.recentHigh);
}
