import { describe, expect, it } from "vitest";
import { officialTakes, takeOf, takesByEvent, type Take } from "./takes";
import type { KeepEntry } from "../schema";

const take = (slug: string, eventId: string | undefined, first: number): Take => ({ slug, eventId, first });

describe("takes", () => {
  const takes = [take("g-2", "ev1", 200), take("g", "ev1", 100), take("other", "ev2", 50), take("loose", undefined, 10)];

  it("orders each game's takes first started first", () => {
    expect(takesByEvent(takes).get("ev1")!.map(t => t.slug)).toEqual(["g", "g-2"]);
  });

  it("counts the first take when nobody picked", () => {
    expect([...officialTakes(takes, {})].sort()).toEqual(["g", "loose", "other"]);
  });

  it("counts the picked take instead", () => {
    const off = officialTakes(takes, { ev1: "g-2" });
    expect(off.has("g-2")).toBe(true);
    expect(off.has("g")).toBe(false);
  });

  it("falls back to the first take when the pick was deleted", () => {
    expect(officialTakes(takes, { ev1: "gone" }).has("g")).toBe(true);
  });

  it("reads a take from a log", () => {
    const setup = {
      slug: "2026-10-01-x", date: "2026-10-01", time: "", opponent: "X", home: null, format: 7, formation: "2-3-1",
      side: "left", halfMin: 25, stopClock: false, level: "beginner", start: [], eventId: "ev9",
    } as const;
    const entries = [{ id: "aaaaaaaa", at: 500, k: "setup", setup }] as unknown as KeepEntry[];
    expect(takeOf("2026-10-01-x", entries)).toEqual({ slug: "2026-10-01-x", eventId: "ev9", first: 500 });
    expect(takeOf("none", [])).toBeNull();
  });
});
