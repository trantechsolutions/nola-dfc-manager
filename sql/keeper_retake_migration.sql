-- Migration: admins retake a game's stats and pick the take that counts.
--
-- A scheduled game can now be kept more than once: the first take at the field, and any number of retakes an
-- admin starts later (from the film, or because the first was kept badly). Each take is its own game in
-- keeper_entries, so nothing is overwritten and every take stays in the history. For each scheduled game one
-- take is official: the one an admin picked (keeper_game_picks), or the first one started when nobody has.
-- The official take is what the schedule, the live page and the season stats show.
--
-- Admins (super admins, the club's admins, the team's managers) keep stats outside the 2-hour window, so a
-- retake can happen any time. Everyone else is still held to the window.
--
--   keeper_is_admin(team)               who may retake and pick
--   keeper_game_picks                   the picked take per scheduled game
--   keeper_pick_take(team, event, game) sets it (admins only)
--   keeper_game_summaries(team)         gains `official` and `takes`
--
-- Needs sql/keeper_native_migration.sql, sql/keeper_game_window_migration.sql and sql/live_game_migration.sql
-- first. Run this in the Supabase SQL editor. Safe to run again.

create or replace function keeper_is_admin(p_team_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null and (
    is_super_admin()
    or exists (select 1 from user_roles ur
               where ur.user_id = auth.uid() and ur.team_id = p_team_id and ur.role = 'team_manager')
    or exists (select 1 from user_roles ur join teams t on t.club_id = ur.club_id
               where ur.user_id = auth.uid() and t.id = p_team_id and ur.role = 'club_admin')
  );
$$;
revoke all on function keeper_is_admin(uuid) from public, anon;
grant execute on function keeper_is_admin(uuid) to authenticated;

create table if not exists keeper_game_picks (
  team_id uuid not null references teams(id) on delete cascade,
  event_id uuid not null,
  game text not null,
  picked_by uuid references auth.users(id) on delete set null default auth.uid(),
  picked_at timestamptz not null default now(),
  primary key (team_id, event_id)
);

alter table keeper_game_picks enable row level security;
revoke all on keeper_game_picks from anon, authenticated;
grant select on keeper_game_picks to authenticated;
drop policy if exists keeper_game_picks_select on keeper_game_picks;
create policy keeper_game_picks_select on keeper_game_picks for select to authenticated
  using (keeper_can_keep(team_id) or film_is_member(team_id));

-- Makes `p_game` the take that counts for the scheduled game `p_event_id`. The take must be one of that game's.
create or replace function keeper_pick_take(p_team_id uuid, p_event_id uuid, p_game text) returns void
  language plpgsql volatile security definer set search_path = public
as $$
begin
  if not keeper_is_admin(p_team_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  if not exists (select 1 from keeper_entries
                  where team_id = p_team_id and game = p_game and entry->>'k' = 'setup'
                    and entry->'setup'->>'eventId' = p_event_id::text) then
    raise exception 'that take is not for this game' using errcode = '22023';
  end if;
  insert into keeper_game_picks (team_id, event_id, game) values (p_team_id, p_event_id, p_game)
  on conflict (team_id, event_id) do update set game = excluded.game, picked_by = auth.uid(), picked_at = now();
end $$;
revoke all on function keeper_pick_take(uuid, uuid, text) from public, anon;
grant execute on function keeper_pick_take(uuid, uuid, text) to authenticated;

-- Deleting a take also drops it as the pick, so the game falls back to its first take.
create or replace function keeper_forget_game(p_team_id uuid, p_game text) returns int
  language plpgsql volatile security definer set search_path = public
as $$
declare
  n int;
begin
  if not keeper_can_keep(p_team_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  delete from keeper_entries where team_id = p_team_id and game = p_game;
  get diagnostics n = row_count;
  delete from keeper_game_picks where team_id = p_team_id and game = p_game;
  return n;
end $$;

-- Admins keep stats at any time for a game in the team's schedule; everyone else inside its window.
create or replace function keeper_entry_ok(p_team_id uuid, p_game text, p_entry jsonb) returns boolean
  language plpgsql stable security definer set search_path = public
as $$
declare
  v_event uuid;
  v_at timestamptz;
begin
  begin
    v_at := to_timestamp((p_entry->>'at')::double precision / 1000.0);
  exception when others then
    return false;
  end;
  if p_entry->>'k' = 'setup' then
    v_event := nullif(p_entry->'setup'->>'eventId', '')::uuid;
  else
    select nullif(entry->'setup'->>'eventId', '')::uuid into v_event
      from keeper_entries
     where team_id = p_team_id and game = p_game and entry->>'k' = 'setup'
     order by created_at desc
     limit 1;
  end if;
  if v_event is null then return false; end if;
  if keeper_is_admin(p_team_id) then
    return exists (select 1 from team_events e where e.id = v_event and e.team_id = p_team_id);
  end if;
  return keeper_window_ok(p_team_id, v_event, v_at);
end $$;

-- The headline per take, now with whether it's the official one and how many takes its game has.
drop function if exists keeper_game_summaries(uuid);
create function keeper_game_summaries(p_team_id uuid)
returns table (game text, event_id uuid, opponent text, game_date date, started_at timestamptz, last_at timestamptz,
               finished boolean, score_us int, score_them int, official boolean, takes int)
  language sql stable security definer set search_path = public
as $$
  with mine as (
    select * from keeper_entries where team_id = p_team_id and (keeper_can_keep(p_team_id) or film_is_member(p_team_id))
  ),
  voided as (select entry->>'ref' as ref from mine where entry->>'k' = 'void'),
  live as (select * from mine where entry->>'k' <> 'void' and id not in (select ref from voided where ref is not null)),
  setups as (
    select distinct on (game) game, entry->'setup' as setup, nullif(entry->'setup'->>'eventId', '')::uuid as event_id
      from live where entry->>'k' = 'setup' order by game, created_at desc
  ),
  firsts as (select game, min(created_at) as first_at from live group by game),
  ranked as (
    select s.*, f.first_at,
      row_number() over (partition by s.event_id order by f.first_at, s.game) as n,
      count(*) over (partition by s.event_id)::int as takes
    from setups s join firsts f using (game)
  )
  select r.game, r.event_id, r.setup->>'opponent', (r.setup->>'date')::date,
    (select min(l.created_at) from live l where l.game = r.game and l.entry->>'k' <> 'setup'),
    (select max(l.created_at) from live l where l.game = r.game),
    exists (select 1 from live l where l.game = r.game and l.entry->>'k' = 'end' and l.entry->>'h' = '2'),
    (select count(*)::int from live l where l.game = r.game and l.entry->>'k' = 'ev' and l.entry->>'type' = 'Goal' and l.entry->>'t' = 'D'),
    (select count(*)::int from live l where l.game = r.game and l.entry->>'k' = 'ev' and l.entry->>'type' = 'Goal' and l.entry->>'t' = 'O'),
    case
      when r.event_id is null then true
      when exists (select 1 from keeper_game_picks p where p.team_id = p_team_id and p.event_id = r.event_id
                     and exists (select 1 from setups s2 where s2.game = p.game))
        then exists (select 1 from keeper_game_picks p where p.team_id = p_team_id and p.event_id = r.event_id and p.game = r.game)
      else r.n = 1
    end,
    case when r.event_id is null then 1 else r.takes end
  from ranked r
  order by (r.setup->>'date') desc, r.first_at;
$$;
revoke all on function keeper_game_summaries(uuid) from public, anon;
grant execute on function keeper_game_summaries(uuid) to authenticated;
