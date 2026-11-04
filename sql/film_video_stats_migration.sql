-- Migration: the video estimates on a kept game's page.
--
-- After a game the coach runs `npm run film -- postgame <Reeplayer link>` on the PC. It downloads the tape, works
-- out possession, passes, turnovers and 5-minute possession stretches with the computer-vision pipeline
-- (tools/film/cv_game.py) and writes them here, one row per kept game. The game's live page
-- (views/film/LiveGameView.jsx) shows them under Stats, marked as estimates, as soon as the run finishes; there's
-- no need to wait for the game's write-up. Running it again replaces the row.
--
--   film_video_stats   readable by the team (film_is_member) and the people keeping stats; written only by the
--                      service role (the coach's PC), so there's no insert or update policy
--
-- Needs sql/film_native_migration.sql and sql/keeper_native_migration.sql first. Run this in the Supabase SQL
-- editor. Safe to run again.

create table if not exists film_video_stats (
  team_id uuid not null references teams(id) on delete cascade,
  game text not null,                 -- the kept game (keeper_entries.game)
  event_id uuid,                      -- its schedule entry, so a retake picked later still finds the numbers
  stats jsonb not null,               -- cv_game.py's game.json and the halves' lengths on the tape
  unsure boolean not null default false, -- the model struggled to tell the kits apart
  source text,                        -- the Reeplayer share page the tape came from
  updated_at timestamptz not null default now(),
  primary key (team_id, game)
);
create index if not exists film_video_stats_event on film_video_stats (team_id, event_id);

alter table film_video_stats enable row level security;
drop policy if exists film_video_stats_select on film_video_stats;
create policy film_video_stats_select on film_video_stats for select to authenticated
  using (keeper_can_keep(team_id) or film_is_member(team_id));
