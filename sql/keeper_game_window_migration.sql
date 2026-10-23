-- Migration: stats are kept per scheduled game, and only around the game.
--
-- Every kept game now belongs to a game in the team's schedule (its setup names the team_events row), and its
-- entries are accepted only from 2 hours before kickoff until 2 hours after the game ends. An event with no end
-- time is taken to last 90 minutes. The window is checked against each entry's own time (`at`, when it was
-- tapped), so taps logged at the field on a phone with no signal still sync afterwards.
--
-- Practice runs never reach the database, so they're untouched.
--
-- Needs sql/keeper_native_migration.sql first. Run this in the Supabase SQL editor. Safe to run again.

create or replace function keeper_window_ok(p_team_id uuid, p_event_id uuid, p_at timestamptz) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from team_events e
     where e.id = p_event_id and e.team_id = p_team_id and e.event_date is not null
       and p_at between e.event_date - interval '2 hours'
                    and coalesce(e.end_date, e.event_date + interval '90 minutes') + interval '2 hours'
  );
$$;

-- An entry is accepted when its game's scheduled event is in its window at the moment it was tapped. A setup
-- entry names the event itself; every other entry follows its game's latest setup (sent first, see keeper.tsx).
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
  return v_event is not null and keeper_window_ok(p_team_id, v_event, v_at);
end $$;
revoke all on function keeper_window_ok(uuid, uuid, timestamptz), keeper_entry_ok(uuid, text, jsonb) from public, anon;
grant execute on function keeper_window_ok(uuid, uuid, timestamptz), keeper_entry_ok(uuid, text, jsonb) to authenticated;

drop policy if exists keeper_entries_insert on keeper_entries;
create policy keeper_entries_insert on keeper_entries for insert to authenticated
  with check (keeper_can_keep(team_id) and created_by = auth.uid() and keeper_entry_ok(team_id, game, entry));
