-- Migration: the game film, inside the manager.
--
-- Until now the film was its own static site: every game, breakdown, lineup and note was encrypted on the
-- coach's PC with a password-derived key, and the manager only handed out those keys (film_access()).
-- From here the film lives in the manager's own tables, guarded by the same row-level security as
-- everything else, and the passwords go away:
--
--   film_teams        the team's short name on the scoreboard ("DFC")                anyone on the team
--   film_games        (existing) now also holds each game's write-up (content)        anyone on the team
--   film_breakdowns   the coaches' breakdown of each game                            coaches
--   film_positions    the positions each player plays, first choice first             coaches
--   film_lineups      who started where and every change, per game ('*' = default)    coaches
--   film_notes        coach notes on a game, section, moment or clip                  coaches (read and write)
--   film_ollie_games  Ollie Sports team stats for games the library doesn't break down anyone on the team
--   film_ollie_players  their player stats                                           coaches
--
-- "Anyone on the team" and "coaches" are film_is_member() and film_is_coach(), as film_access() counts them.
-- The film's tool (dfc-game-film: tools/manager/manager.ts publish) writes everything except notes, with
-- the service key. Clips are videos in a private Cloudflare R2 bucket; the film-clip edge function hands
-- out short-lived links to them after the same membership check (supabase/functions/film-clip).
--
-- Needs sql/game_film_migration.sql and sql/game_film_games_migration.sql first. Run this in the Supabase
-- SQL editor. Safe to run again.

-- Policies call these as the signed-in user, so the user needs to be able to run them. Each only answers
-- about auth.uid().
grant execute on function film_is_coach(uuid) to authenticated;

create table if not exists film_teams (
  team_id uuid primary key references teams(id) on delete cascade,
  short_name text not null,
  updated_at timestamptz not null default now()
);

alter table film_games add column if not exists game_time text not null default '';
alter table film_games add column if not exists opponent text not null default '';
alter table film_games add column if not exists home boolean;
alter table film_games add column if not exists score_us int;
alter table film_games add column if not exists score_them int;
-- The game file without the coaches' breakdown (dfc-game-film app/src/schema.ts PublicGame); null for a
-- game listed before the film moved in.
alter table film_games add column if not exists content jsonb;

create table if not exists film_breakdowns (
  team_id uuid not null,
  slug text not null,
  content jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (team_id, slug),
  foreign key (team_id, slug) references film_games(team_id, slug) on delete cascade
);

create table if not exists film_positions (
  team_id uuid not null references teams(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  positions text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (team_id, player_id)
);

-- lineup: { start: [{ pos, player }], changes: [...], estimated? } with players as players.id, or the
-- name as written when the player has no manager record. slug '*' holds the default starters.
create table if not exists film_lineups (
  team_id uuid not null references teams(id) on delete cascade,
  slug text not null,
  lineup jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (team_id, slug)
);

-- anchor: 'game', 'section:<page>/<id>', 'event:<id>' or 'clip:<id>'.
create table if not exists film_notes (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  slug text not null,
  anchor text not null,
  body text not null check (length(body) between 1 and 4000),
  author_id uuid references auth.users(id) on delete set null default auth.uid(),
  author_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists film_notes_game_idx on film_notes (team_id, slug);

create table if not exists film_ollie_games (
  team_id uuid not null references teams(id) on delete cascade,
  ollie_id text not null,
  game_date date not null,
  content jsonb not null,        -- dfc-game-film schema.ts OllieGame
  updated_at timestamptz not null default now(),
  primary key (team_id, ollie_id)
);

create table if not exists film_ollie_players (
  team_id uuid not null,
  ollie_id text not null,
  players jsonb not null,        -- [{ name, number, stats }]
  updated_at timestamptz not null default now(),
  primary key (team_id, ollie_id),
  foreign key (team_id, ollie_id) references film_ollie_games(team_id, ollie_id) on delete cascade
);

-- Read access: members for the team-wide tables, coaches for the rest.
alter table film_teams enable row level security;
alter table film_breakdowns enable row level security;
alter table film_positions enable row level security;
alter table film_lineups enable row level security;
alter table film_notes enable row level security;
alter table film_ollie_games enable row level security;
alter table film_ollie_players enable row level security;

revoke all on film_teams, film_breakdowns, film_positions, film_lineups, film_notes, film_ollie_games, film_ollie_players
  from anon, authenticated;
grant select on film_teams, film_breakdowns, film_positions, film_lineups, film_ollie_games, film_ollie_players
  to authenticated;
grant select, insert, update, delete on film_notes to authenticated;

drop policy if exists film_teams_select on film_teams;
create policy film_teams_select on film_teams for select to authenticated using (film_is_member(team_id));

drop policy if exists film_ollie_games_select on film_ollie_games;
create policy film_ollie_games_select on film_ollie_games for select to authenticated using (film_is_member(team_id));

drop policy if exists film_breakdowns_select on film_breakdowns;
create policy film_breakdowns_select on film_breakdowns for select to authenticated using (film_is_coach(team_id));

drop policy if exists film_positions_select on film_positions;
create policy film_positions_select on film_positions for select to authenticated using (film_is_coach(team_id));

drop policy if exists film_lineups_select on film_lineups;
create policy film_lineups_select on film_lineups for select to authenticated using (film_is_coach(team_id));

drop policy if exists film_ollie_players_select on film_ollie_players;
create policy film_ollie_players_select on film_ollie_players for select to authenticated using (film_is_coach(team_id));

-- Notes: any coach of the team reads and writes them, as before (there were no accounts, only the coach
-- password). A new note is always the writer's own.
drop policy if exists film_notes_select on film_notes;
create policy film_notes_select on film_notes for select to authenticated using (film_is_coach(team_id));
drop policy if exists film_notes_insert on film_notes;
create policy film_notes_insert on film_notes for insert to authenticated
  with check (film_is_coach(team_id) and author_id = auth.uid());
drop policy if exists film_notes_update on film_notes;
create policy film_notes_update on film_notes for update to authenticated
  using (film_is_coach(team_id)) with check (film_is_coach(team_id));
drop policy if exists film_notes_delete on film_notes;
create policy film_notes_delete on film_notes for delete to authenticated using (film_is_coach(team_id));
