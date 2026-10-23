-- Migration: players can sign in themselves, with the email or phone number on their own roster entry.
--
-- A player's account is linked to their roster entry when the account's email matches players.email, or its
-- phone number matches players.phone. Staff set those on the roster; a guardian can set them for their own
-- player (set_player_contact).
--
-- What a player sees is the TEAM SIDE only: their team, its schedule, RSVPs for themselves, live games and game
-- film, and the team chat. They never get fees, balances, payments, documents, medical forms or the checklist —
-- those keep using user_guardian_player_ids(), which a player's own login never matches.
--
-- Safeguarding: a player is in the team chat (where staff and families can see every message) but can't start a
-- private or group chat, and isn't offered as someone to message (chat_people only lists staff and guardians).
--
-- Needs: chat_threads_migration.sql, chat_admin_oversight_migration.sql, film_native_migration.sql,
-- keeper_native_migration.sql, app_schedule_migration.sql. Run in the Supabase SQL editor. Safe to run again.

begin;

alter table players add column if not exists email text;
alter table players add column if not exists phone text;

-- Phone numbers compared as digits; a 10-digit US number gets its country code, matching how Supabase Auth
-- stores phones ("15045551234").
create or replace function norm_phone(p text) returns text
  language sql immutable
as $$
  select case
    when p is null or regexp_replace(p, '\D', '', 'g') = '' then null
    when length(regexp_replace(p, '\D', '', 'g')) = 10 then '1' || regexp_replace(p, '\D', '', 'g')
    else regexp_replace(p, '\D', '', 'g')
  end;
$$;

create index if not exists players_email_lower_idx on players (lower(email)) where email is not null;
create index if not exists players_phone_norm_idx on players (norm_phone(phone)) where phone is not null;

-- The roster entries an account signs in as: its email or its phone on the player row.
create or replace function player_ids_for_user(p_user uuid) returns setof uuid
  language sql stable security definer set search_path = public, auth
as $$
  select p.id
    from players p
    join auth.users u on u.id = p_user
   where (p.email is not null and u.email is not null and lower(btrim(p.email)) = lower(u.email))
      or (p.phone is not null and u.phone is not null and norm_phone(p.phone) = norm_phone(u.phone));
$$;

create or replace function user_self_player_ids() returns setof uuid
  language sql stable security definer set search_path = public
as $$
  select player_ids_for_user(auth.uid());
$$;

-- Guardians' players plus the account's own roster entry: the team side of the app.
create or replace function user_team_side_player_ids() returns setof uuid
  language sql stable security definer set search_path = public
as $$
  select user_guardian_player_ids()
  union
  select user_self_player_ids();
$$;

revoke all on function player_ids_for_user(uuid) from public, anon, authenticated;
grant execute on function user_self_player_ids(), user_team_side_player_ids(), norm_phone(text) to authenticated;

-- For the app: how the signed-in account relates to each player it can see ('guardian' or 'self').
create or replace function my_player_links() returns table (player_id uuid, relation text)
  language sql stable security definer set search_path = public
as $$
  select id, 'guardian' from players where id in (select user_guardian_player_ids())
  union
  select id, 'self' from players where id in (select user_self_player_ids())
                                   and id not in (select user_guardian_player_ids());
$$;
grant execute on function my_player_links() to authenticated;

-- Staff on the player's club, or the player's guardian, set the player's own sign-in email and phone.
create or replace function set_player_contact(p_player_id uuid, p_email text, p_phone text) returns boolean
  language plpgsql security definer set search_path = public
as $$
declare
  v_email text := nullif(lower(btrim(p_email)), '');
  v_phone text := nullif(btrim(p_phone), '');
begin
  if auth.uid() is null then return false; end if;
  if not (is_super_admin()
          or p_player_id in (select user_guardian_player_ids())
          or exists (select 1 from players p where p.id = p_player_id and p.club_id in (select user_club_ids()))) then
    return false;
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'That email address doesn''t look right.';
  end if;
  if v_phone is not null and length(norm_phone(v_phone)) < 11 then
    raise exception 'That phone number doesn''t look right.';
  end if;
  update players set email = v_email, phone = v_phone where id = p_player_id;
  return true;
end $$;
revoke all on function set_player_contact(uuid, text, text) from public, anon;
grant execute on function set_player_contact(uuid, text, text) to authenticated;

-- ── Team-side policies: guardians' players → guardians' players plus the account's own ──
do $$
declare
  r record;
  v_using text;
  v_check text;
begin
  for r in
    select tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and (tablename, policyname) in (
         ('teams', 'teams_select'),
         ('clubs', 'clubs_select'),
         ('team_events', 'team_events_select'),
         ('team_event_series', 'team_event_series_select'),
         ('team_seasons', 'team_seasons_select'),
         ('event_rsvps', 'event_rsvps_select'),
         ('event_rsvps', 'event_rsvps_write'),
         ('players', 'players_select'),
         ('player_season_stats', 'player_season_stats_select'))
  loop
    v_using := replace(r.qual, 'user_guardian_player_ids()', 'user_team_side_player_ids()');
    v_check := replace(r.with_check, 'user_guardian_player_ids()', 'user_team_side_player_ids()');
    execute format('alter policy %I on %I using (%s)', r.policyname, r.tablename, v_using);
    if v_check is not null then
      execute format('alter policy %I on %I with check (%s)', r.policyname, r.tablename, v_check);
    end if;
  end loop;
end $$;

-- ── Team chat, game film, live games and the calendar subscription: the same widening ──
do $$
declare
  f text;
  v_def text;
begin
  foreach f in array array['chat_member', 'chat_inbox', 'film_is_member', 'film_access', 'team_calendar_token'] loop
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = f;
    if v_def is not null and position('user_guardian_player_ids()' in v_def) > 0 then
      execute replace(v_def, 'user_guardian_player_ids()', 'user_team_side_player_ids()');
    end if;
  end loop;
end $$;

-- A player signed in as themselves (no staff role, not a guardian on the team) only has the team chat.
create or replace function chat_player_only(p_team_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (select 1 from players p where p.team_id = p_team_id and p.id in (select user_self_player_ids()))
     and not is_super_admin()
     and not exists (select 1 from user_roles ur where ur.user_id = auth.uid() and ur.team_id = p_team_id)
     and not exists (select 1 from user_roles ur join teams t on t.club_id = ur.club_id
                      where ur.user_id = auth.uid() and t.id = p_team_id and ur.role = 'club_admin')
     and not exists (select 1 from players p where p.team_id = p_team_id and p.id in (select user_guardian_player_ids()));
$$;
grant execute on function chat_player_only(uuid) to authenticated;

create or replace function chat_can_start(p_team_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select chat_member(p_team_id) and not chat_player_only(p_team_id)
     and case coalesce((select start_policy from team_chat_settings where team_id = p_team_id), 'everyone')
       when 'everyone' then true
       when 'staff' then chat_staff(p_team_id)
       else false
     end;
$$;

-- A player's name in the chat comes from their roster entry when their account has none of its own.
create or replace function chat_display_name(p_user uuid) returns text
  language plpgsql stable security definer set search_path = public, auth
as $$
declare
  v_email text;
  v_profile text;
  v text;
begin
  if p_user is null then return ''; end if;
  select lower(email), nullif(btrim(display_name), '') into v_email, v_profile from user_profiles where user_id = p_user;
  if v_email is null then
    select lower(email) into v_email from auth.users where id = p_user;
  end if;
  -- A profile name that's more than the email's start was chosen by a person: it wins.
  if v_profile is not null and lower(v_profile) <> split_part(coalesce(v_email, ''), '@', 1) then
    return v_profile;
  end if;
  select nullif(btrim(coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name')), '') into v
    from auth.users where id = p_user;
  if v is not null then return v; end if;
  select nullif(btrim(p.first_name || ' ' || coalesce(p.last_name, '')), '') into v
    from players p where p.id in (select player_ids_for_user(p_user)) limit 1;
  if v is not null then return v; end if;
  if v_email is not null then
    select nullif(btrim(g.name), '') into v from guardians g where lower(g.email) = v_email and nullif(btrim(g.name), '') is not null limit 1;
    if v is not null then return v; end if;
    select nullif(btrim(i.invited_name), '') into v from invitations i
     where lower(i.email) = v_email and nullif(btrim(i.invited_name), '') is not null order by i.created_at desc limit 1;
    if v is not null then return v; end if;
  end if;
  return coalesce(v_profile, split_part(coalesce(v_email, ''), '@', 1), '');
end $$;

commit;
