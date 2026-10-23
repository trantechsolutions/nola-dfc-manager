-- Migration: a third way to run a team's schedule — the calendar feed AND the app together.
--
--   teams.schedule_source = 'feed'     the feed, as before
--   teams.schedule_source = 'app'      this app (sql/app_schedule_migration.sql)
--   teams.schedule_source = 'hybrid'   both: the feed's events keep coming from the feed (read-only here), and
--                                      staff add their own games, practices and events in the app
--                                      (team_events.source = 'app'), which feed syncs never touch.
--
-- Needs sql/app_schedule_migration.sql first. Run in the Supabase SQL editor. Safe to run again.

begin;

alter table teams drop constraint if exists teams_schedule_source_check;
alter table teams add constraint teams_schedule_source_check check (schedule_source in ('feed', 'app', 'hybrid'));

commit;
