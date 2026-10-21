-- Migration: each player's season numbers from the game film.
--
-- The film's tool (dfc-game-film: tools/manager/manager.ts stats) works out minutes, starts and positions
-- (from the film's lineups, the scorekeeper's logs or Ollie) and goals, assists, shots and cards (from the
-- scorekeeper's logs or Ollie), and writes one row per player and season here. Each game counts once, from
-- its best source. The player profile and the season evaluations show them, so coaches rate with the
-- evidence in front of them; parents see their own child's.
--
-- stats (jsonb): { games, minutes, available, timedGames, starts, positions: [{ pos, minutes }],
--                  goals, assists, shots, onTarget, yellow, red, eventGames, sources: [...] }
-- minutes, starts and positions are out of timedGames; goals and the rest are out of eventGames.
--
-- Only the film's tool writes (with the service key). Run this in the Supabase SQL editor. Safe to run again.

create table if not exists player_season_stats (
  player_id uuid not null references players(id) on delete cascade,
  season_id text not null references seasons(id) on delete cascade,
  team_id uuid not null references teams(id) on delete cascade,
  stats jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (player_id, season_id, team_id)
);
create index if not exists player_season_stats_team_idx on player_season_stats (team_id, season_id);

alter table player_season_stats enable row level security;
revoke all on player_season_stats from anon, authenticated;
grant select on player_season_stats to authenticated;

-- The team's coaches and team manager, its club's admins and managers, super admins, and the player's
-- own guardians. Not every role on the team: a parent who is also the scorekeeper, or the treasurer,
-- sees only their own child's.
drop policy if exists player_season_stats_select on player_season_stats;
create policy player_season_stats_select on player_season_stats
  for select to authenticated
  using (
    is_super_admin()
    or exists (select 1 from user_roles ur
               where ur.user_id = auth.uid() and ur.team_id = player_season_stats.team_id
                 and ur.role in ('head_coach', 'assistant_coach', 'team_manager'))
    or exists (select 1 from user_roles ur join teams t on t.club_id = ur.club_id
               where ur.user_id = auth.uid() and t.id = player_season_stats.team_id
                 and ur.role in ('club_admin', 'club_manager'))
    or player_id in (select user_guardian_player_ids())
  );
