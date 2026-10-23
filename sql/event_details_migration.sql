-- Migration: more detail on events the app runs, to match what Ollie's "Create Game" offers.
--
--   team_events.location_details    where at the venue: "Field 4, park by the north gate"
--   team_events.meeting_url         a video call link (team meetings, a parents' call)
--   team_events.exclude_from_stats  a game left out of the season's player stats (a scrimmage, a guest-player
--                                   tournament); the scorekeeper still keeps it and families still follow it live
--
-- Needs sql/app_schedule_migration.sql first. Run in the Supabase SQL editor. Safe to run again.

begin;

alter table team_events add column if not exists location_details text;
alter table team_events add column if not exists meeting_url text;
alter table team_events add column if not exists exclude_from_stats boolean not null default false;

alter table team_events drop constraint if exists team_events_location_details_check;
alter table team_events add constraint team_events_location_details_check
  check (location_details is null or length(location_details) <= 300);
alter table team_events drop constraint if exists team_events_meeting_url_check;
alter table team_events add constraint team_events_meeting_url_check
  check (meeting_url is null or meeting_url ~* '^https?://');

commit;
