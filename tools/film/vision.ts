// Estimates a game's ball-and-passing stats from the tape by having Claude follow the play frame by frame.
//
//   npm run film:vision -- <slug>                        follow the whole game (both halves), then print the totals
//   npm run film:vision -- <slug> --from 1H 0:00 --to 1H 5:00   just that stretch (a pilot)
//   npm run film:vision -- <slug> --estimate             frames and token count only: what a full run would cost
//   npm run film:vision -- <slug> --apply                write the totals into the game file's match report
//   options: --fps 1   --window 30 (seconds per request)   --width 1280   --model claude-opus-5-5   --effort medium
//
// The tape is cut into windows of --window seconds inside each half. Each window's frames go to Claude in one
// request, with the kits, the ends and what was happening at the end of the previous window; it returns the
// moments it saw (completed passes, turnovers, shots) and how long each side had the ball. Possession, pass
// counts and passing chains are worked out here from those moments, so a chain can run across windows.
//
// Each window's answer is saved under data/raw/<slug>-vision/, so a run that stops resumes where it left off
// and nothing is paid for twice; delete that folder to start over. Totals go to data/raw/<slug>-vision.json.
//
// Credentials: ANTHROPIC_API_KEY in the environment, or { "apiKey": "…" } in private/film/.anthropic.json.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { DATA, PRIVATE, fail } from "./common";
import { Game } from "../../src/film/schema";
import { mmss, sec } from "../../src/film/lib/time";

const args = process.argv.slice(2);
// The slug is the one word that isn't a flag or a flag's value (--from/--to take two values).
const taken = new Set<number>();
args.forEach((a, i) => {
  if (!a.startsWith("--") || a === "--estimate" || a === "--apply") return;
  for (let k = 1; k <= (a === "--from" || a === "--to" ? 2 : 1); k++) taken.add(i + k);
});
const slug = args.find((a, i) => !a.startsWith("--") && !taken.has(i)) ?? fail("usage: npm run film:vision -- <slug> [--from 1H 0:00 --to 1H 5:00] [--estimate] [--apply]");
const opt = (name: string, def?: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const span = (name: string) => { const i = args.indexOf(name); return i >= 0 ? { h: Number(args[i + 1][0]), c: sec(args[i + 2]) } : null; };
const FPS = Number(opt("--fps", "1"));
const WINDOW = Number(opt("--window", "30"));
const WIDTH = Number(opt("--width", "1280"));
const MODEL = opt("--model", "claude-opus-5-5")!;
const EFFORT = opt("--effort", "medium") as "low" | "medium" | "high" | "xhigh" | "max";
// $ per million tokens (input, output), for the cost lines; only the models this is likely to run on.
const PRICE: Record<string, [number, number]> = { "claude-opus-5-5": [4, 20], "claude-sonnet-5-5": [2, 10], "claude-haiku-5-5": [0.1, 0.5] };

const gamePath = join(DATA, "games", `${slug}.json`);
if (!existsSync(gamePath)) fail(`No game file ${gamePath}`);
const game = Game.parse(JSON.parse(readFileSync(gamePath, "utf8")));
const video = game.highlights.source;
if (!existsSync(video)) fail(`The tape isn't on this PC: ${video}`);
const site = JSON.parse(readFileSync(join(DATA, "site.json"), "utf8")) as { us: string };
const US = site.us, THEM = game.opponent;
const cacheDir = join(DATA, "raw", `${slug}-vision`);

// ── What Claude returns for one window ──
const Team = z.enum(["D", "O"]);
const Moment = z.object({
  t: z.number().describe("seconds into this window"),
  team: Team.describe("D = the team defined as D in the instructions, O = the opponent"),
  type: z.enum(["pass", "turnover", "shot", "shot_on_target", "goal", "out_of_play", "restart"]),
});
const WindowRead = z.object({
  possession: z.object({ D: z.number(), O: z.number(), none: z.number() }).describe("seconds of this window each side had the ball under control; none = loose, out of play or can't tell"),
  moments: z.array(Moment),
  endsWith: z.enum(["D", "O", "none"]).describe("who has the ball in the last frame"),
  visibility: z.enum(["good", "partial", "poor"]).describe("how well the frames let you follow the ball"),
  note: z.string().describe("one short line on anything uncertain"),
});
type WindowRead = z.infer<typeof WindowRead>;

const SYSTEM = `You follow a youth soccer game from frames of a single wide camera that pans with play, and log what happens to the ball.

Teams:
- D is ${US}. O is ${THEM}.
- ${game.events.find((e) => e.y === "Kickoff" && e.h === 1)?.d.en ?? ""}
- First half: ${game.halves[0].meta.en}
- Second half: ${game.halves[1].meta.en}

You get the frames of one window in time order, ${1 / FPS} s apart, each labelled with its time into the window. Log, in order:
- pass: a team completes a pass, meaning a teammate receives it and controls it. A pass that an opponent wins is a turnover, not a pass.
- turnover: the team on the ball loses it to the other team, through an intercepted or misplaced pass, a tackle or a lost dribble. Label it with the team that LOST the ball.
- shot / shot_on_target: an attempt at goal by that team. Use shot_on_target when it would have gone in without the GK or a defender on the line. Use goal when it scores (a goal is also on target, so log only goal).
- out_of_play: the ball leaves the field (label it with the team that touched it last), or play stops for a foul.
- restart: a throw-in, goal kick, corner, free kick or kickoff, labelled with the team taking it.

Count possession as the seconds each side had the ball under control. Loose balls, the ball out of play, and stretches you can't follow count as none.

Rules:
- Log only what the frames show. Between frames ${1 / FPS} s apart, infer a pass only when the ball clearly moved from one player to a teammate who then has it.
- When you can't tell which team has the ball, use none for possession and log no moment, rather than guessing.
- Players are small and far away, so go by shirt colour, and keep each team's colour fixed through the game.
- If the frames show a stoppage (half time, a long break, no play), log nothing and count the time as none.`;

// ── Frames ──
interface Win { h: 1 | 2; from: number; to: number }  // clock seconds within the half
function windows(): Win[] {
  const lo = span("--from"), hi = span("--to");
  const out: Win[] = [];
  for (const h of [1, 2] as const) {
    const len = sec(game.video.halfLength[h]);
    let a = 0, b = len;
    if (lo) { if (h < lo.h) continue; if (h === lo.h) a = lo.c; }
    if (hi) { if (h > hi.h) continue; if (h === hi.h) b = Math.min(b, hi.c); }
    for (let s = a; s < b; s += WINDOW) out.push({ h, from: s, to: Math.min(s + WINDOW, b) });
  }
  return out;
}

function frames(w: Win): Buffer[] {
  const dir = mkdtempSync(join(tmpdir(), "dfc-vision-"));
  try {
    const at = game.video.kickoff[w.h] + w.from;
    execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-ss", String(at), "-t", String(w.to - w.from), "-i", video,
      "-vf", `fps=${FPS},scale=${WIDTH}:-2`, "-q:v", "4", join(dir, "f%04d.jpg")]);
    return readdirSync(dir).sort().map((f) => readFileSync(join(dir, f)));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function content(w: Win, imgs: Buffer[], before: string): Anthropic.Beta.BetaContentBlockParam[] {
  const blocks: Anthropic.Beta.BetaContentBlockParam[] = [
    { type: "text", text: `${w.h === 1 ? "First" : "Second"} half, clock ${mmss(w.from)} to ${mmss(w.to)}. ${before}` },
  ];
  imgs.forEach((img, i) => {
    blocks.push({ type: "text", text: `t=${i / FPS}s` });
    blocks.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: img.toString("base64") } });
  });
  return blocks;
}

function client(required = true): Anthropic | null {
  if (process.env.ANTHROPIC_API_KEY) return new Anthropic();
  const f = join(PRIVATE, ".anthropic.json");
  if (existsSync(f)) return new Anthropic({ apiKey: JSON.parse(readFileSync(f, "utf8")).apiKey });
  return required ? fail("No API key: set ANTHROPIC_API_KEY, or put { \"apiKey\": \"…\" } in private/film/.anthropic.json.") : null;
}

// ── Totals, from the moments in order ──
interface Totals {
  possession: Record<"D" | "O" | "none", number>;
  passes: Record<"D" | "O", number>;
  longestChain: Record<"D" | "O", number>;
  turnovers: Record<"D" | "O", number>;
  shots: Record<"D" | "O", number>;
  onTarget: Record<"D" | "O", number>;
  goals: Record<"D" | "O", number>;
}
function totals(reads: { w: Win; r: WindowRead }[]): Totals {
  const z2 = () => ({ D: 0, O: 0 });
  const T: Totals = { possession: { D: 0, O: 0, none: 0 }, passes: z2(), longestChain: z2(), turnovers: z2(), shots: z2(), onTarget: z2(), goals: z2() };
  let chainTeam: "D" | "O" | null = null, chain = 0;
  const stop = () => { chainTeam = null; chain = 0; };
  for (const { r } of reads) {
    for (const k of ["D", "O", "none"] as const) T.possession[k] += r.possession[k];
    for (const m of [...r.moments].sort((a, b) => a.t - b.t)) {
      if (m.type === "pass") {
        T.passes[m.team]++;
        chain = chainTeam === m.team ? chain + 1 : 1;
        chainTeam = m.team;
        T.longestChain[m.team] = Math.max(T.longestChain[m.team], chain);
      } else {
        if (m.type === "turnover") T.turnovers[m.team]++;
        if (m.type === "shot" || m.type === "shot_on_target" || m.type === "goal") T.shots[m.team]++;
        if (m.type === "shot_on_target" || m.type === "goal") T.onTarget[m.team]++;
        if (m.type === "goal") T.goals[m.team]++;
        stop();
      }
    }
    // A window that ends with the ball loose or the other way breaks any chain.
    if (r.endsWith !== chainTeam) stop();
  }
  return T;
}

function apply(T: Totals, coverage: string) {
  const raw = JSON.parse(readFileSync(gamePath, "utf8"));
  const n = raw.report.numbers;
  const TITLE = { en: "Ball and passing (estimated from the video)", es: "Balón y pases (estimado a partir del video)" };
  n.tables = n.tables.filter((t: { title: { en: string } | null }) => t.title?.en !== TITLE.en && t.title?.en !== "Ball and passing");
  const held = T.possession.D + T.possession.O || 1;
  const pct = (x: number) => Math.round((x / held) * 100);
  n.tables.push({
    title: TITLE,
    rows: [
      { label: { en: "Possession", es: "Posesión" }, us: pct(T.possession.D), them: pct(T.possession.O), unit: "%" },
      { label: { en: "Completed passes", es: "Pases completados" }, us: T.passes.D, them: T.passes.O },
      { label: { en: "Longest passing chain", es: "Cadena de pases más larga" }, us: T.longestChain.D, them: T.longestChain.O },
      { label: { en: "Turnovers", es: "Pérdidas de balón" }, us: T.turnovers.D, them: T.turnovers.O },
      { label: { en: "Shots", es: "Tiros" }, us: T.shots.D, them: T.shots.O },
      { label: { en: "Shots on target", es: "Tiros a puerta" }, us: T.onTarget.D, them: T.onTarget.O },
    ],
  });
  const en = ` The ball and passing table is estimated by an AI model following the tape (${coverage}); treat it as a guide, not a count.`;
  const es = ` La tabla de balón y pases la estima un modelo de IA siguiendo el video (${coverage}); tómela como orientación, no como un conteo.`;
  const base = { en: (n.sub?.en ?? "").replace(/ The ball and passing table[^]*$/, ""), es: (n.sub?.es ?? "").replace(/ La tabla de balón y pases[^]*$/, "") };
  n.sub = { en: (base.en + en).trim(), es: (base.es + es).trim() };
  Game.parse(raw);
  writeFileSync(gamePath, JSON.stringify(raw, null, 2) + "\n");
  console.log(`✓ wrote the estimated table into ${gamePath}`);
}

async function main() {
  const list = windows();
  if (!list.length) fail("No play in that range.");
  mkdirSync(cacheDir, { recursive: true });
  const key = (w: Win) => join(cacheDir, `${w.h}-${String(w.from).padStart(4, "0")}.json`);

  if (args.includes("--estimate")) {
    const sample = frames(list[0]);
    const api = client(false);
    // Without a key, images are about width × height / 750 tokens each, plus the instructions.
    const [fw, fh] = [WIDTH, Math.round((WIDTH * 9) / 16)];
    const perWindow = api
      ? (await api.beta.messages.countTokens({ model: MODEL, system: SYSTEM, messages: [{ role: "user", content: content(list[0], sample, "") }] })).input_tokens
      : Math.round(sample.length * ((fw * fh) / 750) + 1500);
    const counted = { input_tokens: perWindow };
    const todo = list.filter((w) => !existsSync(key(w))).length;
    const inTok = counted.input_tokens * todo;
    const [pi, po] = PRICE[MODEL] ?? [0, 0];
    const outGuess = 2500 * todo;  // thinking plus the JSON, a rough allowance per window
    console.log(`${list.length} windows of ${WINDOW}s (${todo} not yet read), ${sample.length} frames each at ${WIDTH}px.`);
    console.log(`≈ ${counted.input_tokens.toLocaleString()} input tokens per window → ${(inTok / 1e6).toFixed(1)}M in, ≈ ${(outGuess / 1e6).toFixed(2)}M out.`);
    if (pi) console.log(`≈ $${((inTok * pi + outGuess * po) / 1e6).toFixed(2)} on ${MODEL} (output is a guess; thinking varies).`);
    return;
  }

  const api = client()!;
  const reads: { w: Win; r: WindowRead }[] = [];
  let spentIn = 0, spentOut = 0, poor = 0;
  for (const [i, w] of list.entries()) {
    const label = `${w.h}H ${mmss(w.from)}–${mmss(w.to)}`;
    if (existsSync(key(w))) { reads.push({ w, r: WindowRead.parse(JSON.parse(readFileSync(key(w), "utf8"))) }); continue; }
    const prev = reads.at(-1);
    const before = prev && prev.w.h === w.h
      ? `At the end of the previous window the ball was with ${prev.r.endsWith === "none" ? "neither side (loose or out of play)" : prev.r.endsWith}.`
      : `This window starts at ${w.from === 0 ? "the kickoff" : "a cut in the tape"}.`;
    const imgs = frames(w);
    let r: WindowRead | null = null;
    for (let attempt = 1; attempt <= 3 && !r; attempt++) {
      try {
        const res = await api.beta.messages.parse({
          model: MODEL,
          max_tokens: 16000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: EFFORT, format: betaZodOutputFormat(WindowRead) },
          system: SYSTEM,
          messages: [{ role: "user", content: content(w, imgs, before) }],
        });
        spentIn += res.usage.input_tokens; spentOut += res.usage.output_tokens;
        if (res.stop_reason === "refusal") { console.warn(`  ${label}: declined (${res.stop_details?.category ?? "no category"}); skipped`); break; }
        if (res.stop_reason === "max_tokens") { console.warn(`  ${label}: ran out of tokens; retrying`); continue; }
        r = res.parsed_output ?? null;
      } catch (err) {
        if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.InternalServerError || err instanceof Anthropic.APIConnectionError) {
          console.warn(`  ${label}: ${err.message}; retrying`);
          await new Promise((ok) => setTimeout(ok, 5000 * attempt));
        } else throw err;
      }
    }
    if (!r) continue;
    writeFileSync(key(w), JSON.stringify(r, null, 2));
    reads.push({ w, r });
    if (r.visibility === "poor") poor++;
    const [pi, po] = PRICE[MODEL] ?? [0, 0];
    const p = r.moments.filter((m) => m.type === "pass").length;
    console.log(`  ${i + 1}/${list.length} ${label}: ${p} passes, ${r.moments.length - p} other, ball D ${r.possession.D}s O ${r.possession.O}s · ${r.visibility}` +
      (pi ? ` · $${((spentIn * pi + spentOut * po) / 1e6).toFixed(2)} so far` : ""));
  }

  const T = totals(reads.sort((a, b) => a.w.h - b.w.h || a.w.from - b.w.from));
  const covered = reads.reduce((s, x) => s + (x.w.to - x.w.from), 0);
  const whole = sec(game.video.halfLength[1]) + sec(game.video.halfLength[2]);
  const coverage = covered >= whole - WINDOW ? "the whole game" : `${Math.round((covered / whole) * 100)}% of the game`;
  const held = T.possession.D + T.possession.O || 1;
  writeFileSync(join(DATA, "raw", `${slug}-vision.json`), JSON.stringify({ model: MODEL, fps: FPS, window: WINDOW, coverage, totals: T }, null, 2));
  console.log(`\n${slug} (${coverage}; ${poor} windows hard to follow):`);
  console.log(`  possession  ${US} ${Math.round((T.possession.D / held) * 100)}% · ${THEM} ${Math.round((T.possession.O / held) * 100)}%  (${Math.round((T.possession.none / covered) * 100)}% loose or unclear)`);
  for (const [k, label] of [["passes", "completed passes"], ["longestChain", "longest chain"], ["turnovers", "turnovers"], ["shots", "shots"], ["onTarget", "on target"], ["goals", "goals seen"]] as const) {
    console.log(`  ${label.padEnd(17)} ${T[k].D} – ${T[k].O}`);
  }
  console.log(`  score on file      ${game.score.us} – ${game.score.them}`);
  if (args.includes("--apply")) apply(T, coverage);
}

await main();
