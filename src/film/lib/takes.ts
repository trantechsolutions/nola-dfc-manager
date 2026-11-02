// A scheduled game can be kept more than once (sql/keeper_retake_migration.sql): the first take at the field and
// any retakes an admin starts later. Each take is its own log. One take per scheduled game counts: the one an
// admin picked, or the first one started when nobody has. Mirrors keeper_game_summaries' `official`.
import type { KeepEntry } from "../schema";
import { replay } from "./keeplog";

export interface Take { slug: string; eventId?: string; first: number }

/** A log's take: its game, its scheduled game and when it was started. Null for a log with no setup. */
export function takeOf(slug: string, entries: KeepEntry[]): Take | null {
  const setup = replay(entries).setup;
  if (!setup) return null;
  return { slug, eventId: setup.eventId, first: Math.min(...entries.map(e => e.at)) };
}

/** The takes of each scheduled game, first started first. */
export function takesByEvent(takes: Take[]): Map<string, Take[]> {
  const by = new Map<string, Take[]>();
  for (const t of takes) if (t.eventId) by.set(t.eventId, [...(by.get(t.eventId) ?? []), t]);
  for (const list of by.values()) list.sort((a, b) => a.first - b.first || a.slug.localeCompare(b.slug));
  return by;
}

/** The takes that count: per scheduled game the picked one (if it still exists) or the first; a log with no
 *  scheduled game always counts. `picks` is scheduled game id → picked take. */
export function officialTakes(takes: Take[], picks: Record<string, string>): Set<string> {
  const out = new Set(takes.filter(t => !t.eventId).map(t => t.slug));
  for (const [eventId, list] of takesByEvent(takes)) {
    const picked = list.find(t => t.slug === picks[eventId]);
    out.add((picked ?? list[0]).slug);
  }
  return out;
}
