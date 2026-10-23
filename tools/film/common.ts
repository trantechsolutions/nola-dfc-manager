// Shared by the game-film tools: where the working files live, the manager connection, and small helpers.
// Everything under private/film/ stays on the coach's PC (git-ignored):
//   private/film/.manager.json   { "url": "https://<project>.supabase.co", "serviceRoleKey": "…", "teamId": "<uuid>",
//                                  "timeZone": "America/Chicago" }   lines starting with // are comments
//   private/film/.r2.json        the clips bucket: endpoint, accessKeyId, secretAccessKey, clipsBucket
//   private/film/data/           games/<slug>.json, roster.json, lineups.json, site.json, ollie/, i18n/, raw/
//   private/film/clips/<slug>/   highlight clips (make_highlights.py)
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { toSchedule, type ManagerEvent } from "../../src/film/lib/schedule";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PRIVATE = join(ROOT, "private", "film");
export const DATA = process.env.DFC_DATA || join(PRIVATE, "data");

export const fail = (msg: string): never => { console.error(msg); process.exit(1); };

export const readSecret = (name: string, required = true) => {
  const f = join(PRIVATE, name);
  const v = existsSync(f) ? readFileSync(f, "utf8").replace(/^﻿/, "").trim() : "";
  if (!v && required) fail(`Put the password on one line in private/film/${name} (never committed).`);
  return v;
};

/** A JSON file in DATA, or null if it isn't there. */
export const dataJson = (f: string) => (existsSync(join(DATA, f)) ? JSON.parse(readFileSync(join(DATA, f), "utf8")) : null);

export interface Settings { url: string; serviceRoleKey: string; teamId?: string; timeZone: string }
export function settings(): Settings {
  const f = join(PRIVATE, ".manager.json");
  if (!existsSync(f)) fail("No private/film/.manager.json. Create it with the project's url and service_role key (see tools/film/common.ts).");
  const s = JSON.parse(readFileSync(f, "utf8").split(/\r?\n/).filter(l => !l.trim().startsWith("//")).join("\n"));
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(s.url ?? "")) fail("private/film/.manager.json: url must be https://<project>.supabase.co");
  if (!s.serviceRoleKey) fail("private/film/.manager.json: serviceRoleKey is missing.");
  return { url: s.url.replace(/\/$/, ""), serviceRoleKey: s.serviceRoleKey, teamId: s.teamId, timeZone: s.timeZone || "America/Chicago" };
}

export const admin = (s: Settings) => createClient(s.url, s.serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
export const needTeam = (s: Settings) => s.teamId ?? fail("private/film/.manager.json: set teamId (run: npm run film -- teams).");

export async function team(db: SupabaseClient, id: string) {
  const { data, error } = await db.from("teams").select("id, name, age_group, status").eq("id", id).maybeSingle();
  if (error) fail(`Couldn't read the team: ${error.message}`);
  return data ?? fail(`No team ${id} in the manager. Run: npm run film -- teams`);
}

/** The team's games in the schedule, as the film reads them (src/film/lib/schedule.ts). */
export async function scheduleOf(db: SupabaseClient, s: Settings, teamId: string, teamName: string) {
  const { data, error } = await db.from("team_events")
    .select("id, title, location, event_date, event_type, is_cancelled").eq("team_id", teamId).order("event_date");
  if (error) fail(`Couldn't read the schedule: ${error.message}`);
  const site = dataJson("site.json") as { us: string };
  return toSchedule((data ?? []) as ManagerEvent[], { timeZone: s.timeZone, teamNames: [site.us, teamName] });
}
