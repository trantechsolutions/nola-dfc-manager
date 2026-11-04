// After a game: from a Reeplayer link to the video estimates on the kept game's page (npm run film -- postgame).
// The tape is found by its recording start, the kept game whose whistles fall inside it is the one it shows, and
// the scorekeeper's taps place each half on the tape. A long referee whistle near a tap pulls it onto the
// whistle, since the recording start is only to the minute and taps come a few seconds late.
import type { KeepEntry } from "../schema";
import { ordered } from "./keeplog";
import { sec } from "./time";

/** Milliseconds since the epoch of a wall-clock time ("YYYY-MM-DD HH:MM") in a time zone. */
export function zonedEpoch(local: string, timeZone: string): number {
  const m = local.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) throw new Error(`Not a local time: ${local}`);
  const asUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  // The zone's offset at that moment: format the UTC guess in the zone and see how far it lands.
  const offset = (t: number) => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
        .formatToParts(new Date(t)).map(x => [x.type, x.value]),
    );
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - t;
  };
  const first = asUtc - offset(asUtc);
  return asUtc - offset(first); // a second pass settles a guess that crossed a daylight-saving change
}

export interface HalfTimes { kick: number; end: number | null } // wall-clock ms
export type Halves = Partial<Record<1 | 2, HalfTimes>>;

/** When each half kicked off and ended, by the scorekeeper's taps (undone taps left out). The clock reads `c`
 *  when it's started, so kick-off was `c` before that tap. */
export function keeperHalves(entries: KeepEntry[]): Halves {
  const voided = new Set(entries.flatMap(e => (e.k === "void" ? [e.ref] : [])));
  const live = ordered(entries).filter(e => e.k !== "void" && !voided.has(e.id));
  const out: Halves = {};
  for (const h of [1, 2] as const) {
    const start = live.find(e => e.k === "clock" && e.h === h && e.run);
    if (!start || start.k !== "clock") continue;
    const end = live.find(e => e.k === "end" && e.h === h && e.at >= start.at);
    out[h] = { kick: start.at - sec(start.c) * 1000, end: end ? end.at : null };
  }
  return out;
}

/** Of several kept games (takes), the one played while the tape was recording: its first kick-off falls inside
 *  the recording. Null when none does. */
export function pickTake<T extends { halves: Halves }>(takes: T[], recStart: number, durationSec: number): T | null {
  const inside = takes.filter(t => {
    const k = t.halves[1]?.kick ?? t.halves[2]?.kick;
    return k != null && k >= recStart - 120_000 && k <= recStart + durationSec * 1000;
  });
  inside.sort((a, b) => (a.halves[1]?.kick ?? a.halves[2]!.kick) - (b.halves[1]?.kick ?? b.halves[2]!.kick));
  return inside[0] ?? null;
}

export interface Whistle { t: number; long: boolean } // seconds into the tape (scan_tape.py cues)

/** The long whistle nearest `t` (seconds into the tape) within `window` seconds, else `t`. */
export function snapToWhistle(t: number, whistles: Whistle[], window = 150): number {
  let best: number | null = null;
  for (const w of whistles) if (w.long && Math.abs(w.t - t) <= window && (best == null || Math.abs(w.t - t) < Math.abs(best - t))) best = w.t;
  return best ?? t;
}

const clock = (s: number) => {
  const r = Math.round(s);
  return `${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")}`;
};

export interface TapeTiming { kickoff: { 1: number; 2: number }; halfLength: { 1: string; 2: string } }

/** Where each half sits on the tape (as a game file's `video`): kick-off in seconds into the tape and the half's
 *  length as m:ss. A half with no end tap runs `halfMin` minutes (or to the end of the tape). */
export function tapeTiming(halves: Halves, recStart: number, durationSec: number, halfMin: number, whistles: Whistle[] = []): TapeTiming {
  const kickoff = { 1: 0, 2: 0 }, halfLength = { 1: "0:00", 2: "0:00" };
  for (const h of [1, 2] as const) {
    const t = halves[h];
    if (!t) throw new Error(`The scorekeeper's log has no kick-off for half ${h}`);
    const kick = Math.max(0, snapToWhistle((t.kick - recStart) / 1000, whistles));
    const rawEnd = t.end != null ? (t.end - recStart) / 1000 : kick + halfMin * 60;
    const end = Math.min(durationSec, t.end != null ? snapToWhistle(rawEnd, whistles, 90) : rawEnd);
    if (kick >= durationSec) throw new Error(`Half ${h} kicks off after the tape ends`);
    if (end <= kick) throw new Error(`Half ${h} ends before it starts on the tape`);
    kickoff[h] = Math.round(kick);
    halfLength[h] = clock(end - kick);
  }
  return { kickoff, halfLength };
}

// What the kept game's page shows from the video (film_video_stats.stats: cv_game.py's game.json plus the
// halves' lengths on the tape).
export interface VideoStats {
  possession: [number, number];
  passes: [number, number];
  turnovers: [number, number];
  halves?: Record<"1" | "2", { possession: { DFC: number; OPP: number } }>;
  stretches?: { half: 1 | 2; from: string; dfc: number }[];
  halfLength?: { 1: string; 2: string };
}
export interface VideoRow { label: { en: string; es: string }; us: number; them: number; unit?: string }

/** The game's estimated numbers, as bar rows: possession (overall and by half), passes and turnovers. */
export function videoRows(s: VideoStats): VideoRow[] {
  const pct = (x: number) => Math.round(x * 100);
  const rows: VideoRow[] = [{ label: { en: "Possession", es: "Posesión" }, us: s.possession[0], them: s.possession[1], unit: "%" }];
  for (const [h, en, es] of [["1", "Possession, first half", "Posesión, primera parte"], ["2", "Possession, second half", "Posesión, segunda parte"]] as const) {
    const p = s.halves?.[h]?.possession;
    if (p) rows.push({ label: { en, es }, us: pct(p.DFC), them: pct(p.OPP), unit: "%" });
  }
  rows.push({ label: { en: "Completed passes", es: "Pases completados" }, us: s.passes[0], them: s.passes[1] });
  rows.push({ label: { en: "Turnovers", es: "Pérdidas de balón" }, us: s.turnovers[0], them: s.turnovers[1] });
  return rows;
}

/** Our possession in each 5-minute stretch, as bar rows ("1st half 0–5'"). */
export function stretchRows(s: VideoStats): VideoRow[] {
  return (s.stretches ?? []).map(st => {
    const a = Math.floor(sec(st.from) / 60);
    const len = s.halfLength?.[st.half];
    const b = len ? Math.min(a + 5, Math.ceil(sec(len) / 60)) : a + 5;
    return {
      label: { en: `${st.half === 1 ? "1st" : "2nd"} half ${a}–${b}'`, es: `${st.half}.ª parte ${a}–${b}'` },
      us: st.dfc, them: 100 - st.dfc, unit: "%",
    };
  });
}
