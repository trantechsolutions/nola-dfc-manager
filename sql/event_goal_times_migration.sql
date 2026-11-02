-- Migration: when each goal went in, on scheduled games.
--
-- Staff entering a past game's result in Schedule can also give the minute of each goal, ours and theirs, so
-- the film breakdown has the goal times to hand when Ollie has none. Each column is a list of minutes in game
-- time (0–130, stoppage and extra time included), in the order the goals went in; null means not entered.
--
-- It also re-applies sql/event_scores_migration.sql (score_for / score_against), so a database that never had
-- that one gets the score columns too: saving a score fails without them.
--
-- No new policies: the existing team_events update policy covers who writes (schedule editors).
--
-- Run this in the Supabase SQL editor. Safe to run again.

alter table team_events add column if not exists score_for smallint;
alter table team_events add column if not exists score_against smallint;

alter table team_events drop constraint if exists team_events_score_range;
alter table team_events add constraint team_events_score_range
  check ((score_for is null or score_for between 0 and 99) and (score_against is null or score_against between 0 and 99));

alter table team_events add column if not exists goal_minutes_for smallint[];
alter table team_events add column if not exists goal_minutes_against smallint[];

alter table team_events drop constraint if exists team_events_goal_minutes_range;
alter table team_events add constraint team_events_goal_minutes_range
  check (
    (goal_minutes_for is null or (0 <= all (goal_minutes_for) and 130 >= all (goal_minutes_for)))
    and (goal_minutes_against is null or (0 <= all (goal_minutes_against) and 130 >= all (goal_minutes_against)))
  );

-- PostgREST caches the schema; reload it so the app sees the new columns straight away.
notify pgrst, 'reload schema';
