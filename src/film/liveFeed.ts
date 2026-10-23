// A kept game as families follow it live (views/film/LiveGameView.jsx): the moments worth reading, by name and
// in both languages, with the score after each goal. Built from the scorekeeper's log through the same replay
// the scorekeeper uses (lib/keeplog.ts), so the two never disagree.
import type { KeepEntry, Text } from "./schema";
import { ordered, type Ev, type KeepState } from "./lib/keeplog";

export type MomentKind = "goal" | "shot" | "save" | "card" | "sub" | "whistle" | "setpiece";

export interface Moment {
  id: string;
  at: number;              // wall time it was logged
  h: 1 | 2 | null;
  c: string | null;        // the clock in its half
  kind: MomentKind;
  side: "D" | "O" | null;  // us, them, or neither (a whistle)
  text: Text;
  score?: { us: number; them: number }; // after a goal
  scorer?: string;                       // our scorer's name, for the celebration
}

const both = (en: string, es = en): Text => ({ en, es });

/** The moments of a game, oldest first: goals, shots, saves, cards, penalties, substitutions and the whistles. */
export function playByPlay(entries: KeepEntry[], s: KeepState, us: string): Moment[] {
  const opp = s.setup?.opponent || "";
  const voided = new Set(entries.flatMap(e => (e.k === "void" ? [e.ref] : [])));
  const live = ordered(entries).filter(e => e.k !== "void" && !voided.has(e.id));
  const out: Moment[] = [];
  const score = { us: 0, them: 0 };
  let kickedOff = false;

  for (const e of live) {
    if (e.k === "clock" && e.run && !kickedOff) {
      kickedOff = true;
      out.push({ id: e.id, at: e.at, h: e.h, c: e.c, kind: "whistle", side: null, text: both("Kick-off.", "Comienza el partido.") });
    } else if (e.k === "clock" && e.run && e.h === 2 && !out.some(m => m.kind === "whistle" && m.h === 2)) {
      out.push({ id: e.id, at: e.at, h: 2, c: e.c, kind: "whistle", side: null, text: both("Second half under way.", "Empieza la segunda parte.") });
    } else if (e.k === "end") {
      const ft = e.h === 2;
      out.push({
        id: e.id, at: e.at, h: e.h, c: e.c, kind: "whistle", side: null,
        text: ft
          ? both(`Full time: ${us} ${score.us}–${score.them} ${opp}.`, `Final: ${us} ${score.us}–${score.them} ${opp}.`)
          : both(`Half time: ${us} ${score.us}–${score.them} ${opp}.`, `Descanso: ${us} ${score.us}–${score.them} ${opp}.`),
      });
    } else if (e.k === "sub") {
      out.push({ id: e.id, at: e.at, h: e.h, c: e.c, kind: "sub", side: "D", text: both(`Substitution: ${e.on} on for ${e.off}.`, `Cambio: entra ${e.on} por ${e.off}.`) });
    } else if (e.k === "ev") {
      const m = moment(e as Ev, us, opp, score);
      if (m) out.push({ id: e.id, at: e.at, h: e.h, c: e.c, side: e.t, ...m });
    }
  }
  return out;
}

function moment(e: Ev, us: string, opp: string, score: { us: number; them: number }): Pick<Moment, "kind" | "text" | "score" | "scorer"> | null {
  const ours = e.t === "D";
  const who = ours ? e.player || us : e.opp === "gk" ? `${opp} keeper` : opp;
  const whoEs = ours ? e.player || us : e.opp === "gk" ? `el portero de ${opp}` : opp;
  switch (e.type) {
    case "Goal": {
      score[ours ? "us" : "them"]++;
      const now = { ...score };
      const line = `${us} ${now.us}–${now.them} ${opp}`;
      if (e.og) {
        return { kind: "goal", score: now, text: both(`Own goal. ${ours ? us : opp} score. ${line}.`, `Gol en propia puerta. Marca ${ours ? us : opp}. ${line}.`) };
      }
      const assist = ours && e.assist ? e.assist : null;
      return ours
        ? { kind: "goal", score: now, scorer: e.player || undefined, text: both(`GOAL! ${who} scores${assist ? `, assisted by ${assist}` : ""}. ${line}.`, `¡GOL! Marca ${whoEs}${assist ? `, asistencia de ${assist}` : ""}. ${line}.`) }
        : { kind: "goal", score: now, text: both(`${opp} score. ${line}.`, `Marca ${opp}. ${line}.`) };
    }
    case "Shot": {
      const [en, es] =
        e.result === "saved" || e.result === "caught" ? [`${who} shoots on target; the keeper saves.`, `Tiro a puerta de ${whoEs}; para el portero.`]
        : e.result === "blocked" ? [`${who}'s shot is blocked.`, `Tiro de ${whoEs} bloqueado.`]
        : e.result === "post" ? [`${who} hits the post!`, `¡${whoEs} estrella el balón en el palo!`]
        : e.on ? [`${who} shoots on target.`, `Tiro a puerta de ${whoEs}.`]
        : [`${who} shoots wide.`, `Tiro fuera de ${whoEs}.`];
      return { kind: "shot", text: both(en, es) };
    }
    case "Save":
      return { kind: "save", text: ours ? both(`Great save by ${e.player || `the ${us} keeper`}!`, `¡Gran parada de ${e.player || `el portero de ${us}`}!`) : both(`Save by the ${opp} keeper.`, `Parada del portero de ${opp}.`) };
    case "Yellow":
      return { kind: "card", text: both(`Yellow card: ${who}.`, `Tarjeta amarilla: ${whoEs}.`) };
    case "Red":
      return { kind: "card", text: both(`Red card: ${who}.`, `Tarjeta roja: ${whoEs}.`) };
    case "Penalty":
      return { kind: "setpiece", text: both(`Penalty to ${ours ? us : opp}.`, `Penalti para ${ours ? us : opp}.`) };
    default:
      return null;
  }
}

/** Goals in `next` that weren't in `prev` (by moment id), newest last: what to celebrate when the page updates. */
export const newGoals = (prev: Moment[], next: Moment[]) => {
  const seen = new Set(prev.map(m => m.id));
  return next.filter(m => m.kind === "goal" && !seen.has(m.id));
};

/** How a finished game went for us. */
export const resultOf = (score: { us: number; them: number }): "win" | "draw" | "loss" =>
  score.us > score.them ? "win" : score.us < score.them ? "loss" : "draw";
