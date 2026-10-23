-- Migration: the app runs the team's schedule.
--
-- Until now the schedule always came from a calendar feed (TeamSnap, Google, GotSport…): the app read it,
-- kept the games in team_events, and nothing could be added here. A team can now choose, in Team
-- Settings, who runs its schedule:
--
--   teams.schedule_source = 'feed'   the feed, as before
--   teams.schedule_source = 'app'    this app: staff add games, practices and events here, practices can
--                                    repeat, and families subscribe to the app's own calendar link
--
-- Switching to 'app' imports everything the feed lists once (practices too), then stops reading it.
--
-- Also:
--   team_events     + end time, arrive-by, uniform, opponent, home/away, the series a practice belongs to,
--                     and where the row came from ('feed' or 'app')
--   team_event_series  a repeating practice: weekdays, times and dates; its sessions are team_events rows
--   event_rsvps     each player's answer per event (going / maybe / not going), set by their guardians
--                     or staff; everyone on the team sees the headcount
--   team_calendar_tokens  the secret in each team's subscribe link (supabase/functions/team-calendar). Its own
--                     table, not a column on teams: teams has a public read policy for the public calendar.
--
-- Who may change the schedule: team_events was writable by anyone holding any role on the team, parents
-- included. Once the app is the source of truth that matters, so writes to team_events and
-- team_event_series now need a role that edits the schedule in the app (src/utils/roles.js
-- TEAM_EDIT_SCHEDULE): super admin, the club's admins, and the team's manager or scheduler. The planner,
-- which promotes confirmed games into team_events, is already limited to those roles. Reading is unchanged.
--
-- Run this in the Supabase SQL editor. Safe to run again.

create extension if not exists pgcrypto;

-- ── Teams ──
alter table teams add column if not exists schedule_source text not null default 'feed';
alter table teams drop constraint if exists teams_schedule_source_check;
alter table teams add constraint teams_schedule_source_check check (schedule_source in ('feed', 'app'));

-- ── Subscribe links ──
create table if not exists team_calendar_tokens (
  team_id uuid primary key references teams(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(18), 'hex'),
  created_at timestamptz not null default now()
);
alter table team_calendar_tokens enable row level security;
revoke all on team_calendar_tokens from anon, authenticated;

-- The team's subscribe token for anyone on the team (staff, or a guardian of one of its players); made on
-- first ask. Null for anyone else.
create or replace function team_calendar_token(p_team_id uuid) returns text
  language plpgsql volatile security definer set search_path = public
as $$
declare
  v text;
begin
  if auth.uid() is null then return null; end if;
  if not (is_super_admin()
          or p_team_id in (select user_team_ids())
          or p_team_id in (select team_id from players where id in (select user_guardian_player_ids()))) then
    return null;
  end if;
  insert into team_calendar_tokens (team_id) values (p_team_id) on conflict (team_id) do nothing;
  select token into v from team_calendar_tokens where team_id = p_team_id;
  return v;
end $$;
revoke all on function team_calendar_token(uuid) from public, anon;
grant execute on function team_calendar_token(uuid) to authenticated;

-- ── Who edits the schedule ──
create or replace function schedule_editor_team_ids() returns setof uuid
  language sql stable security definer set search_path = public
as $$
  select t.id from teams t where is_super_admin()
  union
  select ur.team_id from user_roles ur
   where ur.user_id = auth.uid() and ur.team_id is not null and ur.role in ('team_manager', 'scheduler')
  union
  select t.id from teams t join user_roles ur on ur.club_id = t.club_id
   where ur.user_id = auth.uid() and ur.role = 'club_admin';
$$;
revoke all on function schedule_editor_team_ids() from public, anon;
grant execute on function schedule_editor_team_ids() to authenticated;

-- ── Repeating practices ──
create table if not exists team_event_series (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  title text not null,
  event_type text not null default 'practice',
  location text,
  weekdays int[] not null check (array_length(weekdays, 1) > 0),   -- 0 = Sunday … 6 = Saturday
  start_time time not null,
  end_time time,
  starts_on date not null,
  ends_on date not null,
  arrival_minutes int check (arrival_minutes between 0 and 240),
  uniform text,
  notes text,
  skip_blackouts boolean not null default true,
  time_zone text not null default 'America/Chicago',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

-- ── Events ──
alter table team_events add column if not exists end_date timestamptz;
alter table team_events add column if not exists arrival_minutes int;
alter table team_events add column if not exists uniform text;
alter table team_events add column if not exists opponent text;
alter table team_events add column if not exists is_home boolean;
alter table team_events add column if not exists series_id uuid references team_event_series(id) on delete set null;
-- A session of a series edited on its own: the series no longer rewrites it.
alter table team_events add column if not exists series_detached boolean not null default false;
alter table team_events add column if not exists source text not null default 'feed';
alter table team_events drop constraint if exists team_events_source_check;
alter table team_events add constraint team_events_source_check check (source in ('feed', 'app'));
alter table team_events drop constraint if exists team_events_arrival_check;
alter table team_events add constraint team_events_arrival_check check (arrival_minutes is null or arrival_minutes between 0 and 240);
create index if not exists team_events_series_idx on team_events (series_id);

-- ── RSVPs ──
create table if not exists event_rsvps (
  event_id uuid not null references team_events(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  status text not null check (status in ('going', 'maybe', 'no')),
  note text check (note is null or length(note) <= 200),
  responded_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (event_id, player_id)
);
create index if not exists event_rsvps_player_idx on event_rsvps (player_id);

-- ── Row-level security ──
alter table team_event_series enable row level security;
alter table event_rsvps enable row level security;
revoke all on team_event_series, event_rsvps from anon;
grant select, insert, update, delete on team_event_series, event_rsvps to authenticated;

-- Events: read as before; write only for schedule editors.
drop policy if exists "team_events_insert" on team_events;
create policy "team_events_insert" on team_events for insert to authenticated
  with check (team_id in (select schedule_editor_team_ids()));
drop policy if exists "team_events_update" on team_events;
create policy "team_events_update" on team_events for update to authenticated
  using (team_id in (select schedule_editor_team_ids()))
  with check (team_id in (select schedule_editor_team_ids()));
drop policy if exists "team_events_delete" on team_events;
create policy "team_events_delete" on team_events for delete to authenticated
  using (team_id in (select schedule_editor_team_ids()));

-- Series: whoever can read the team's events reads them; editors write.
drop policy if exists team_event_series_select on team_event_series;
create policy team_event_series_select on team_event_series for select to authenticated
  using (
    is_super_admin()
    or team_id in (select user_team_ids())
    or team_id in (select team_id from players where id in (select user_guardian_player_ids()))
  );
drop policy if exists team_event_series_write on team_event_series;
create policy team_event_series_write on team_event_series for all to authenticated
  using (team_id in (select schedule_editor_team_ids()))
  with check (team_id in (select schedule_editor_team_ids()));

-- RSVPs: everyone on the team sees the headcount; a guardian answers for their own child, staff for anyone.
create or replace function rsvp_event_team(p_event_id uuid) returns uuid
  language sql stable security definer set search_path = public
as $$ select team_id from team_events where id = p_event_id $$;
revoke all on function rsvp_event_team(uuid) from public, anon;
grant execute on function rsvp_event_team(uuid) to authenticated;

drop policy if exists event_rsvps_select on event_rsvps;
create policy event_rsvps_select on event_rsvps for select to authenticated
  using (
    is_super_admin()
    or rsvp_event_team(event_id) in (select user_team_ids())
    or rsvp_event_team(event_id) in (select team_id from players where id in (select user_guardian_player_ids()))
  );
drop policy if exists event_rsvps_write on event_rsvps;
create policy event_rsvps_write on event_rsvps for all to authenticated
  using (
    player_id in (select user_guardian_player_ids())
    or rsvp_event_team(event_id) in (select schedule_editor_team_ids())
    or rsvp_event_team(event_id) in (
      select ur.team_id from user_roles ur
       where ur.user_id = auth.uid() and ur.role in ('head_coach', 'assistant_coach'))
  )
  with check (
    (player_id in (select user_guardian_player_ids())
      or rsvp_event_team(event_id) in (select schedule_editor_team_ids())
      or rsvp_event_team(event_id) in (
        select ur.team_id from user_roles ur
         where ur.user_id = auth.uid() and ur.role in ('head_coach', 'assistant_coach')))
    -- The player is on the event's team.
    and exists (select 1 from players p where p.id = player_id and p.team_id = rsvp_event_team(event_id))
  );
