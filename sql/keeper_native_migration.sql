-- Migration: the scorekeeper inside the manager.
--
-- The scorekeeper screen used to live on the game film site, where every tap was encrypted in the browser
-- with a key from the scorekeeper password and written to keeper_log. It now runs in the manager under the
-- signed-in account, so entries are kept as plain rows guarded by row-level security:
--
--   keeper_entries   one row per tap (the screen's KeepEntry, dfc-game-film schema.ts), append-only. Undo is
--                    an entry of its own ("void"), so two phones keeping the same game merge by id.
--
-- Who keeps and reads stats: the team's coaches and manager, its club's admins, super admins and the team's
-- scorekeepers (film_user_can_keep(), sql/keeper_accounts_migration.sql). Deleting a whole game (a test, or
-- one started twice) goes through keeper_forget_game().
--
-- The existing encrypted logs are copied over by dfc-game-film: npx tsx tools/manager/manager.ts move-keeper.
--
-- Needs sql/keeper_accounts_migration.sql first. Run this in the Supabase SQL editor. Safe to run again.

create table if not exists keeper_entries (
  id text primary key check (id ~ '^[a-z0-9-]{8,40}$'),
  team_id uuid not null references teams(id) on delete cascade,
  game text not null check (game ~ '^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$'),
  entry jsonb not null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists keeper_entries_game_idx on keeper_entries (team_id, game);

create or replace function keeper_can_keep(p_team_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$ select auth.uid() is not null and film_user_can_keep(auth.uid(), p_team_id) $$;
revoke all on function keeper_can_keep(uuid) from public, anon;
grant execute on function keeper_can_keep(uuid) to authenticated;

-- Removes a game's entries for the team (a test game, or one started twice on two phones).
create or replace function keeper_forget_game(p_team_id uuid, p_game text) returns int
  language plpgsql volatile security definer set search_path = public
as $$
declare
  n int;
begin
  if not keeper_can_keep(p_team_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from keeper_entries where team_id = p_team_id and game = p_game;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function keeper_forget_game(uuid, text) from public, anon;
grant execute on function keeper_forget_game(uuid, text) to authenticated;

alter table keeper_entries enable row level security;
revoke all on keeper_entries from anon, authenticated;
grant select, insert on keeper_entries to authenticated;

drop policy if exists keeper_entries_select on keeper_entries;
create policy keeper_entries_select on keeper_entries for select to authenticated using (keeper_can_keep(team_id));
drop policy if exists keeper_entries_insert on keeper_entries;
create policy keeper_entries_insert on keeper_entries for insert to authenticated
  with check (keeper_can_keep(team_id) and created_by = auth.uid());
