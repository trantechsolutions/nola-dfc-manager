-- Migration: final scores on scheduled games.
--
-- Staff with schedule access enter the result on a past game in Schedule; parents see it beside the game
-- (W 3–1, L 0–2, D 1–1). Both columns are null until a result is entered, and setting both back to null
-- clears it. The game film's tool may write these too, from its own scorekeeper logs.
--
-- No new policies: the existing team_events select/update policies already cover who reads (the team and
-- its guardians) and who writes (the team's staff). Calendar sync upserts named columns only, so a re-sync
-- leaves a score in place.
--
-- Run this in the Supabase SQL editor. Safe to run again.

alter table team_events add column if not exists score_for smallint;
alter table team_events add column if not exists score_against smallint;

alter table team_events drop constraint if exists team_events_score_range;
alter table team_events add constraint team_events_score_range
  check ((score_for is null or score_for between 0 and 99) and (score_against is null or score_against between 0 and 99));
