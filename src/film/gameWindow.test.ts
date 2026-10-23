import { describe, expect, it } from "vitest";
import { isOpen, windowFor } from "./gameWindow";

const H = 60 * 60 * 1000;
const kickoff = "2026-10-24T14:00:00.000Z";
const at = (iso: string, offset: number) => new Date(iso).getTime() + offset;

describe("a game's stat window", () => {
  it("opens 2 hours before kickoff and closes 2 hours after the end", () => {
    const w = windowFor(kickoff, "2026-10-24T15:30:00.000Z");
    expect(isOpen(w, at(kickoff, -2 * H - 1))).toBe(false);
    expect(isOpen(w, at(kickoff, -2 * H))).toBe(true);
    expect(isOpen(w, at("2026-10-24T15:30:00.000Z", 2 * H))).toBe(true);
    expect(isOpen(w, at("2026-10-24T15:30:00.000Z", 2 * H + 1))).toBe(false);
  });

  it("takes a game with no end time to last 90 minutes", () => {
    const w = windowFor(kickoff, null);
    expect(w.closes).toBe(at(kickoff, 1.5 * H + 2 * H));
  });

  it("is closed for a game that isn't in the schedule", () => {
    expect(isOpen(null, Date.now())).toBe(false);
  });
});
