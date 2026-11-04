import { describe, expect, it } from "vitest";
import { keeperHalves, pickTake, snapToWhistle, stretchRows, tapeTiming, videoRows, zonedEpoch } from "./postgame";
import type { KeepEntry } from "../schema";

const min = (m: number, s = 0) => Date.UTC(2026, 9, 24, 14, m, s); // 9:00 in Chicago (CDT) is 14:00 UTC

describe("zonedEpoch", () => {
  it("reads a local time in the team's zone", () => {
    expect(zonedEpoch("2026-10-24 09:00", "America/Chicago")).toBe(min(0));
    expect(zonedEpoch("2026-12-05 09:00", "America/Chicago")).toBe(Date.UTC(2026, 11, 5, 15, 0)); // CST
  });
});

describe("keeperHalves", () => {
  const log: KeepEntry[] = [
    { id: "entry-0001", at: min(1), k: "clock", h: 1, c: "0:00", run: true },
    { id: "entry-0002", at: min(10), k: "clock", h: 1, c: "9:00", run: false },
    { id: "entry-0003", at: min(11), k: "clock", h: 1, c: "9:00", run: true },
    { id: "entry-0004", at: min(32), k: "end", h: 1, c: "30:00" },
    { id: "entry-0005", at: min(40, 20), k: "clock", h: 2, c: "0:20", run: true }, // started 20 s late
    { id: "entry-0006", at: min(70), k: "end", h: 2, c: "30:00" },
    { id: "entry-0007", at: min(71), k: "end", h: 2, c: "30:00" },
    { id: "entry-0008", at: min(72), k: "void", ref: "entry-0006" },
  ];
  it("takes each half's first running clock and its end, leaving undone taps out", () => {
    expect(keeperHalves(log)).toEqual({ 1: { kick: min(1), end: min(32) }, 2: { kick: min(40), end: min(71) } });
  });
});

describe("tapeTiming", () => {
  const halves = { 1: { kick: min(1), end: min(32) }, 2: { kick: min(40), end: min(71) } };
  it("places each half on the tape from the recording start", () => {
    expect(tapeTiming(halves, min(0), 80 * 60, 30)).toEqual({ kickoff: { 1: 60, 2: 2400 }, halfLength: { 1: "31:00", 2: "31:00" } });
  });
  it("pulls a kick-off onto a nearby long whistle", () => {
    const w = [{ t: 95, long: true }, { t: 61, long: false }, { t: 2410, long: true }];
    expect(tapeTiming(halves, min(0), 80 * 60, 30, w).kickoff).toEqual({ 1: 95, 2: 2410 });
  });
  it("runs a half with no end tap for its length, and stops at the end of the tape", () => {
    const t = tapeTiming({ 1: { kick: min(1), end: null }, 2: { kick: min(40), end: min(90) } }, min(0), 65 * 60, 30);
    expect(t.halfLength).toEqual({ 1: "30:00", 2: "25:00" });
  });
  it("says when a half is missing", () => {
    expect(() => tapeTiming({ 1: halves[1] }, min(0), 4800, 30)).toThrow(/half 2/);
  });
});

describe("snapToWhistle", () => {
  it("keeps the time when no long whistle is close", () => {
    expect(snapToWhistle(100, [{ t: 400, long: true }])).toBe(100);
  });
});

describe("pickTake", () => {
  it("picks the take played while the tape was recording", () => {
    const takes = [
      { slug: "retake", halves: { 1: { kick: min(0) + 86_400_000, end: null } } },
      { slug: "first", halves: { 1: { kick: min(3), end: null } } },
    ];
    expect(pickTake(takes, min(0), 4800)?.slug).toBe("first");
    expect(pickTake(takes, min(0) + 3 * 86_400_000, 4800)).toBeNull();
  });
});

describe("video rows", () => {
  const s = {
    possession: [55, 45] as [number, number], passes: [80, 60] as [number, number], turnovers: [30, 35] as [number, number],
    halves: { 1: { possession: { DFC: 0.6, OPP: 0.4 } }, 2: { possession: { DFC: 0.5, OPP: 0.5 } } },
    stretches: [{ half: 1 as const, from: "0:00", dfc: 60 }, { half: 1 as const, from: "30:00", dfc: 40 }],
    halfLength: { 1: "31:10", 2: "30:00" },
  };
  it("lists possession, passes and turnovers", () => {
    expect(videoRows(s).map(r => [r.label.en, r.us, r.them])).toEqual([
      ["Possession", 55, 45], ["Possession, first half", 60, 40], ["Possession, second half", 50, 50],
      ["Completed passes", 80, 60], ["Turnovers", 30, 35],
    ]);
  });
  it("labels the stretches, the last one ending with the half", () => {
    expect(stretchRows(s).map(r => r.label.en)).toEqual(["1st half 0–5'", "1st half 30–32'"]);
  });
});
