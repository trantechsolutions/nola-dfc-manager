import { describe, expect, it } from "vitest";
import { isIdle, isUnfinishedPractice, PRACTICE_IDLE_MS } from "./keeper";
import type { KeepEntry, KeepSetup } from "./schema";

const setup = (practice: boolean): KeepSetup => ({
  slug: "2026-10-22-practice", date: "2026-10-22", time: "", opponent: "Practice", home: null,
  format: 7, halfMin: 30, start: [], ...(practice ? { practice: true } : {}),
});
const T0 = Date.UTC(2026, 9, 22, 18);
const log = (practice: boolean, ...more: KeepEntry[]): KeepEntry[] => [
  { id: "setup-0001", at: T0, k: "setup", setup: setup(practice) },
  ...more,
];
const end = (h: 1 | 2, at: number): KeepEntry => ({ id: `end-${h}-000001`, at, k: "end", h, c: "30:00" });

describe("practice runs", () => {
  it("counts a practice run as unfinished until full time", () => {
    expect(isUnfinishedPractice(log(true))).toBe(true);
    expect(isUnfinishedPractice(log(true, end(1, T0 + 1000)))).toBe(true);
    expect(isUnfinishedPractice(log(true, end(1, T0 + 1000), end(2, T0 + 2000)))).toBe(false);
  });

  it("never treats a real game as a practice run", () => {
    expect(isUnfinishedPractice(log(false))).toBe(false);
  });

  it("is idle an hour after the last tap, not the first", () => {
    const entries = log(true, end(1, T0 + 50 * 60 * 1000));
    expect(isIdle(entries, T0 + PRACTICE_IDLE_MS + 1)).toBe(false);
    expect(isIdle(entries, T0 + 50 * 60 * 1000 + PRACTICE_IDLE_MS + 1)).toBe(true);
  });
});
