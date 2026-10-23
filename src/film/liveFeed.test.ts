import { describe, expect, it } from "vitest";
import { newGoals, playByPlay, resultOf } from "./liveFeed";
import { replay } from "./lib/keeplog";
import type { KeepEntry, KeepSetup } from "./schema";

const setup: KeepSetup = {
  slug: "2026-10-24-mandeville", date: "2026-10-24", time: "09:00", opponent: "Mandeville", home: true,
  format: 7, halfMin: 30, start: [{ pos: "ST", player: "Emma Guidry" }],
};
let n = 0;
const id = () => `entry-${String(++n).padStart(6, "0")}`;
const at = (min: number) => Date.UTC(2026, 9, 24, 14, min);
const ev = (min: number, f: Record<string, unknown>): KeepEntry => ({ id: id(), at: at(min), k: "ev", h: 1, c: `${min}:00`, ...f } as KeepEntry);

const log = (): KeepEntry[] => {
  n = 0;
  return [
    { id: id(), at: at(0), k: "setup", setup },
    { id: id(), at: at(0), k: "clock", h: 1, c: "0:00", run: true },
    ev(5, { type: "Shot", t: "D", player: "Emma Guidry", on: false }),
    ev(8, { type: "Goal", t: "D", player: "Emma Guidry", assist: "Ava Broussard" }),
    ev(12, { type: "Pass", t: "D", player: "Ava Broussard", to: "Emma Guidry" }),
    ev(20, { type: "Goal", t: "O", opp: "pl" }),
    { id: id(), at: at(30), k: "end", h: 1, c: "30:00" },
  ];
};

describe("live play-by-play", () => {
  it("keeps the moments worth reading, by name, with the score after each goal", () => {
    const entries = log();
    const moments = playByPlay(entries, replay(entries), "NOLA");
    expect(moments.map(m => m.kind)).toEqual(["whistle", "shot", "goal", "goal", "whistle"]);
    const [, , ours, theirs, ht] = moments;
    expect(ours.text.en).toBe("GOAL! Emma Guidry scores, assisted by Ava Broussard. NOLA 1–0 Mandeville.");
    expect(ours.score).toEqual({ us: 1, them: 0 });
    expect(ours.scorer).toBe("Emma Guidry");
    expect(theirs.text.en).toBe("Mandeville score. NOLA 1–1 Mandeville.");
    expect(ht.text.en).toBe("Half time: NOLA 1–1 Mandeville.");
    expect(ours.text.es).toContain("¡GOL! Marca Emma Guidry");
  });

  it("leaves out a goal the scorekeeper undid", () => {
    const entries = log();
    const goal = entries.find(e => e.k === "ev" && e.type === "Goal" && e.t === "O")!;
    entries.push({ id: id(), at: at(21), k: "void", ref: goal.id });
    const moments = playByPlay(entries, replay(entries), "NOLA");
    expect(moments.filter(m => m.kind === "goal")).toHaveLength(1);
    expect(moments[moments.length - 1].text.en).toBe("Half time: NOLA 1–0 Mandeville.");
  });

  it("spots the goals that just arrived", () => {
    const entries = log();
    const before = playByPlay(entries.slice(0, 3), replay(entries.slice(0, 3)), "NOLA");
    const after = playByPlay(entries, replay(entries), "NOLA");
    expect(newGoals(before, after).map(m => m.side)).toEqual(["D", "O"]);
    expect(newGoals(after, after)).toEqual([]);
  });

  it("reads the result", () => {
    expect(resultOf({ us: 3, them: 1 })).toBe("win");
    expect(resultOf({ us: 2, them: 2 })).toBe("draw");
    expect(resultOf({ us: 0, them: 1 })).toBe("loss");
  });
});
