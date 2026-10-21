-- Migration: link the team's schedule to its game film breakdowns.
--
-- The film's tool (dfc-game-film: tools/manager/manager.ts games) matches each game on the film site to
-- its game in team_events (same day and opponent, else the only game that day, else the tournament that
-- weekend) and lists it here. The schedule then shows Match report and Highlights on those games, opening
-- the film already unlocked on that page (the keys still come from film_access()).
--
-- Only the film's tool writes (with the service key). Anyone on the team can read their team's rows:
-- the same people film_access() lets in.
--
-- Needs sql/game_film_migration.sql first. Run this in the Supabase SQL editor. Safe to run again.

create table if not exists film_games (
  team_id uuid not null references teams(id) on delete cascade,
  slug text not null,                                              -- the game's address on the film site
  event_id uuid references team_events(id) on delete set null,     -- null when no scheduled game matched
  game_date date not null,
  has_highlights boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (team_id, slug)
);
create index if not exists film_games_event_idx on film_games(event_id);

-- On the team, as film_access() counts it: coaches, scorekeepers, staff, guardians of an active player.
create or replace function film_is_member(p_team_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null and (
    film_is_coach(p_team_id)
    or film_is_scorekeeper(p_team_id)
    or p_team_id in (select user_team_ids())
    or exists (select 1 from players p
               where p.team_id = p_team_id and p.status = 'active'
                 and p.id in (select user_guardian_player_ids()))
  );
$$;
revoke all on function film_is_member(uuid) from public, anon;
grant execute on function film_is_member(uuid) to authenticated;

alter table film_games enable row level security;
revoke all on film_games from anon, authenticated;
grant select on film_games to authenticated;

drop policy if exists film_games_select on film_games;
create policy film_games_select on film_games
  for select to authenticated
  using (film_is_member(team_id));
