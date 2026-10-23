-- Migration: families follow a game live.
--
-- The scorekeeper's log (keeper_entries) was readable only by the people keeping stats. Now everyone on the
-- team (film_is_member(): staff, the guardians of its active players, scorekeepers) can read it, so a game in
-- the schedule opens a live page: the running score and clock, a play-by-play, the stats, and a celebration
-- when a goal goes in. Writing is unchanged: only those who keep stats add entries.
--
--   keeper_entries        readable by the team; sent live (Realtime) as the scorekeeper taps
--   keeper_game_summaries(team)  one row per kept game: its schedule entry, score, start, last tap, finished
--
-- Practice runs never leave the scorekeeper's phone, so they're never shown.
--
-- Needs sql/keeper_native_migration.sql first. Run this in the Supabase SQL editor. Safe to run again.

drop policy if exists keeper_entries_select on keeper_entries;
create policy keeper_entries_select on keeper_entries for select to authenticated
  using (keeper_can_keep(team_id) or film_is_member(team_id));

-- Each game's headline, worked out from its entries the way the scorekeeper's replay does: an entry undone by a
-- later "void" doesn't count, goals count for the side that scored them, full time is the second half's end.
create or replace function keeper_game_summaries(p_team_id uuid)
returns table (game text, event_id uuid, opponent text, game_date date, started_at timestamptz, last_at timestamptz,
               finished boolean, score_us int, score_them int)
  language sql stable security definer set search_path = public
as $$
  with mine as (
    select * from keeper_entries where team_id = p_team_id and (keeper_can_keep(p_team_id) or film_is_member(p_team_id))
  ),
  voided as (select entry->>'ref' as ref from mine where entry->>'k' = 'void'),
  live as (select * from mine where entry->>'k' <> 'void' and id not in (select ref from voided where ref is not null)),
  setups as (
    select distinct on (game) game, entry->'setup' as setup from live where entry->>'k' = 'setup' order by game, created_at desc
  )
  select s.game,
    nullif(s.setup->>'eventId', '')::uuid,
    s.setup->>'opponent',
    (s.setup->>'date')::date,
    (select min(l.created_at) from live l where l.game = s.game and l.entry->>'k' <> 'setup'),
    (select max(l.created_at) from live l where l.game = s.game),
    exists (select 1 from live l where l.game = s.game and l.entry->>'k' = 'end' and l.entry->>'h' = '2'),
    (select count(*)::int from live l where l.game = s.game and l.entry->>'k' = 'ev' and l.entry->>'type' = 'Goal' and l.entry->>'t' = 'D'),
    (select count(*)::int from live l where l.game = s.game and l.entry->>'k' = 'ev' and l.entry->>'type' = 'Goal' and l.entry->>'t' = 'O')
  from setups s
  order by (s.setup->>'date') desc;
$$;
revoke all on function keeper_game_summaries(uuid) from public, anon;
grant execute on function keeper_game_summaries(uuid) to authenticated;

-- Taps reach open live pages as they happen.
alter table keeper_entries replica identity full;
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'keeper_entries') then
    alter publication supabase_realtime add table keeper_entries;
  end if;
end $$;
