-- Migration: real names in chat, private and group chats, and a team setting for who may start them.
--
-- Needs sql/team_chat_migration.sql first. Run this in the Supabase SQL editor. Safe to run again.
--
-- 1. Names. Profiles made at sign-in fall back to the start of the email address ("jdoe42") when the sign-in
--    carries no name, and chat stamped that on every message. chat_display_name() now looks for a real name
--    first: a profile name that isn't just the email's start, the sign-in provider's name, the name the club
--    holds for them as a guardian, the name they were invited under. Chat reads names through it, so fixing a
--    name fixes it on old messages too, and the stamped names on existing messages are corrected below.
--
-- 2. Private and group chats. Beside each team's chat, people on a team can talk one-on-one or in a named
--    group with others on the same team:
--      chat_threads         a direct (two people) or group chat, kept within one team
--      chat_thread_members  who is in it, and how far each has read
--      team_messages        + thread_id: null for the team chat, else the private or group chat
--    Only members can read a private or group chat. Started, joined and left through the functions below,
--    which check that everyone involved is on the team.
--
-- 3. Who may start chats, per team (team_chat_settings.start_policy): 'everyone' (default), 'staff' (only staff
--    start chats; families still reply in the ones they're added to), or 'none' (team chat only). Set by the
--    team's manager, the club's admins or a super admin. Turning it off doesn't remove chats that exist; staff
--    in a chat can close it, and a closed chat is kept but takes no new messages.

-- ── 1. Names ──
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
  if v_email is not null then
    select nullif(btrim(g.name), '') into v from guardians g where lower(g.email) = v_email and nullif(btrim(g.name), '') is not null limit 1;
    if v is not null then return v; end if;
    select nullif(btrim(i.invited_name), '') into v from invitations i
     where lower(i.email) = v_email and nullif(btrim(i.invited_name), '') is not null order by i.created_at desc limit 1;
    if v is not null then return v; end if;
  end if;
  return coalesce(v_profile, split_part(coalesce(v_email, ''), '@', 1), '');
end $$;
revoke all on function chat_display_name(uuid) from public, anon;
grant execute on function chat_display_name(uuid) to authenticated;

-- ── 2. Private and group chats ──
create table if not exists chat_threads (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  kind text not null check (kind in ('direct', 'group')),
  title text check (title is null or length(title) <= 80),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null
);
create index if not exists chat_threads_team_idx on chat_threads (team_id);

create table if not exists chat_thread_members (
  thread_id uuid not null references chat_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  added_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);
create index if not exists chat_thread_members_user_idx on chat_thread_members (user_id);

alter table team_messages add column if not exists thread_id uuid references chat_threads(id) on delete cascade;
create index if not exists team_messages_thread_idx on team_messages (thread_id, created_at desc) where thread_id is not null;

create table if not exists team_chat_settings (
  team_id uuid primary key references teams(id) on delete cascade,
  start_policy text not null default 'everyone' check (start_policy in ('everyone', 'staff', 'none')),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Whether a given person (not only the signed-in one) is in a team's chat: a role on the team, or the
-- guardian of one of its active players.
create or replace function chat_user_on_team(p_user uuid, p_team_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (select 1 from user_roles ur where ur.user_id = p_user and ur.team_id = p_team_id)
      or exists (select 1 from players p
                   join guardians g on g.player_id = p.id
                   join user_profiles up on lower(up.email) = lower(g.email)
                  where p.team_id = p_team_id and p.status = 'active' and up.user_id = p_user);
$$;

create or replace function chat_in_thread(p_thread_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (select 1 from chat_thread_members where thread_id = p_thread_id and user_id = auth.uid());
$$;

create or replace function chat_can_start(p_team_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select chat_member(p_team_id) and case coalesce((select start_policy from team_chat_settings where team_id = p_team_id), 'everyone')
    when 'everyone' then true
    when 'staff' then chat_staff(p_team_id)
    else false
  end;
$$;

-- The team's manager, the club's admins and super admins decide who may start chats.
create or replace function chat_can_manage(p_team_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select is_super_admin()
      or exists (select 1 from user_roles ur where ur.user_id = auth.uid() and ur.team_id = p_team_id and ur.role = 'team_manager')
      or exists (select 1 from user_roles ur join teams t on t.club_id = ur.club_id
                  where ur.user_id = auth.uid() and t.id = p_team_id and ur.role = 'club_admin');
$$;

revoke all on function chat_user_on_team(uuid, uuid), chat_in_thread(uuid), chat_can_start(uuid), chat_can_manage(uuid)
  from public, anon;
grant execute on function chat_in_thread(uuid), chat_can_start(uuid), chat_can_manage(uuid) to authenticated;

-- People this person can chat with on a team: everyone on it with an account, staff first.
create or replace function chat_people(p_team_id uuid)
returns table (user_id uuid, name text, role text, detail text)
  language sql stable security definer set search_path = public
as $$
  with staff as (
    select ur.user_id, string_agg(distinct ur.role, ',') as roles
      from user_roles ur
     where ur.team_id = p_team_id and ur.role not in ('parent')
     group by ur.user_id
  ),
  families as (
    select up.user_id, string_agg(distinct p.first_name, ', ') as kids
      from players p
      join guardians g on g.player_id = p.id
      join user_profiles up on lower(up.email) = lower(g.email)
     where p.team_id = p_team_id and p.status = 'active'
     group by up.user_id
  ),
  everyone as (
    select coalesce(s.user_id, f.user_id) as user_id, s.roles, f.kids
      from staff s full join families f on f.user_id = s.user_id
  )
  select e.user_id, chat_display_name(e.user_id),
         case when e.roles is not null and e.roles <> 'scorekeeper' then 'staff' else 'family' end,
         coalesce(e.kids, '')
    from everyone e
   where chat_member(p_team_id)
   order by (e.roles is not null and e.roles <> 'scorekeeper') desc, chat_display_name(e.user_id);
$$;
revoke all on function chat_people(uuid) from public, anon;
grant execute on function chat_people(uuid) to authenticated;

-- Starts a chat on a team with the given people (the starter is added). Two people make a direct chat, and an
-- existing direct chat between them is reopened rather than duplicated. Returns the chat's id.
create or replace function chat_start(p_team_id uuid, p_user_ids uuid[], p_title text default null) returns uuid
  language plpgsql volatile security definer set search_path = public
as $$
declare
  v_ids uuid[];
  v_thread uuid;
  v_other uuid;
begin
  if not chat_can_start(p_team_id) then raise exception 'starting chats is turned off for this team' using errcode = '42501'; end if;
  select array_agg(distinct u) into v_ids from unnest(coalesce(p_user_ids, '{}') || auth.uid()) u where u is not null;
  if coalesce(array_length(v_ids, 1), 0) < 2 then raise exception 'pick at least one person'; end if;
  if array_length(v_ids, 1) > 60 then raise exception 'too many people for one chat'; end if;
  if exists (select 1 from unnest(v_ids) u where u <> auth.uid() and not chat_user_on_team(u, p_team_id)) then
    raise exception 'everyone in a chat must be on the team' using errcode = '42501';
  end if;

  if array_length(v_ids, 1) = 2 and nullif(btrim(coalesce(p_title, '')), '') is null then
    select u into v_other from unnest(v_ids) u where u <> auth.uid();
    select t.id into v_thread from chat_threads t
     where t.team_id = p_team_id and t.kind = 'direct' and t.closed_at is null
       and exists (select 1 from chat_thread_members m where m.thread_id = t.id and m.user_id = auth.uid())
       and exists (select 1 from chat_thread_members m where m.thread_id = t.id and m.user_id = v_other)
     limit 1;
    if v_thread is not null then return v_thread; end if;
    insert into chat_threads (team_id, kind) values (p_team_id, 'direct') returning id into v_thread;
  else
    insert into chat_threads (team_id, kind, title)
      values (p_team_id, 'group', nullif(left(btrim(coalesce(p_title, '')), 80), '')) returning id into v_thread;
  end if;
  insert into chat_thread_members (thread_id, user_id, added_by)
    select v_thread, u, auth.uid() from unnest(v_ids) u on conflict do nothing;
  return v_thread;
end $$;

-- Adds people to a group chat. Any member may, within the team's start policy.
create or replace function chat_add_members(p_thread_id uuid, p_user_ids uuid[]) returns void
  language plpgsql volatile security definer set search_path = public
as $$
declare
  t chat_threads;
begin
  select * into t from chat_threads where id = p_thread_id;
  if not found or not chat_in_thread(p_thread_id) then raise exception 'not in this chat' using errcode = '42501'; end if;
  if t.kind <> 'group' then raise exception 'people can only be added to a group chat'; end if;
  if t.closed_at is not null then raise exception 'this chat is closed'; end if;
  if not chat_can_start(t.team_id) then raise exception 'starting chats is turned off for this team' using errcode = '42501'; end if;
  if exists (select 1 from unnest(p_user_ids) u where not chat_user_on_team(u, t.team_id)) then
    raise exception 'everyone in a chat must be on the team' using errcode = '42501';
  end if;
  insert into chat_thread_members (thread_id, user_id, added_by)
    select p_thread_id, u, auth.uid() from unnest(p_user_ids) u on conflict do nothing;
end $$;

create or replace function chat_leave(p_thread_id uuid) returns void
  language sql volatile security definer set search_path = public
as $$ delete from chat_thread_members where thread_id = p_thread_id and user_id = auth.uid(); $$;

create or replace function chat_rename(p_thread_id uuid, p_title text) returns void
  language plpgsql volatile security definer set search_path = public
as $$
begin
  if not chat_in_thread(p_thread_id) then raise exception 'not in this chat' using errcode = '42501'; end if;
  update chat_threads set title = nullif(left(btrim(coalesce(p_title, '')), 80), '') where id = p_thread_id and kind = 'group';
end $$;

-- Closes a chat: kept, readable, but no new messages. Its starter or staff in it may.
create or replace function chat_close(p_thread_id uuid) returns void
  language plpgsql volatile security definer set search_path = public
as $$
declare
  t chat_threads;
begin
  select * into t from chat_threads where id = p_thread_id;
  if not found or not chat_in_thread(p_thread_id) or not (t.created_by = auth.uid() or chat_staff(t.team_id)) then
    raise exception 'only the person who started this chat or staff can close it' using errcode = '42501';
  end if;
  update chat_threads set closed_at = now(), closed_by = auth.uid() where id = p_thread_id and closed_at is null;
end $$;

create or replace function chat_set_policy(p_team_id uuid, p_policy text) returns void
  language plpgsql volatile security definer set search_path = public
as $$
begin
  if not chat_can_manage(p_team_id) then raise exception 'not allowed' using errcode = '42501'; end if;
  insert into team_chat_settings (team_id, start_policy, updated_by, updated_at)
    values (p_team_id, p_policy, auth.uid(), now())
    on conflict (team_id) do update set start_policy = excluded.start_policy, updated_by = auth.uid(), updated_at = now();
end $$;

create or replace function chat_mark_thread_read(p_thread_id uuid) returns void
  language sql volatile security definer set search_path = public
as $$ update chat_thread_members set last_read_at = now() where thread_id = p_thread_id and user_id = auth.uid(); $$;

revoke all on function chat_start(uuid, uuid[], text), chat_add_members(uuid, uuid[]), chat_leave(uuid), chat_rename(uuid, text),
  chat_close(uuid), chat_set_policy(uuid, text), chat_mark_thread_read(uuid) from public, anon;
grant execute on function chat_start(uuid, uuid[], text), chat_add_members(uuid, uuid[]), chat_leave(uuid), chat_rename(uuid, text),
  chat_close(uuid), chat_set_policy(uuid, text), chat_mark_thread_read(uuid) to authenticated;

-- Tables are read directly (members only) and written only through the functions above.
alter table chat_threads enable row level security;
alter table chat_thread_members enable row level security;
alter table team_chat_settings enable row level security;
revoke all on chat_threads, chat_thread_members, team_chat_settings from anon, authenticated;
grant select on chat_threads, chat_thread_members, team_chat_settings to authenticated;

drop policy if exists chat_threads_select on chat_threads;
create policy chat_threads_select on chat_threads for select to authenticated using (chat_in_thread(id));
drop policy if exists chat_thread_members_select on chat_thread_members;
create policy chat_thread_members_select on chat_thread_members for select to authenticated using (chat_in_thread(thread_id));
drop policy if exists team_chat_settings_select on team_chat_settings;
create policy team_chat_settings_select on team_chat_settings for select to authenticated using (chat_member(team_id));

-- ── Messages: team chat or a private/group chat ──
drop policy if exists team_messages_select on team_messages;
create policy team_messages_select on team_messages for select to authenticated
  using (case when thread_id is null then chat_member(team_id) else chat_in_thread(thread_id) end);
drop policy if exists team_messages_insert on team_messages;
create policy team_messages_insert on team_messages for insert to authenticated
  with check (case when thread_id is null then chat_member(team_id) else chat_in_thread(thread_id) end);
drop policy if exists team_messages_update on team_messages;
create policy team_messages_update on team_messages for update to authenticated
  using (author_id = auth.uid() or (thread_id is null and chat_staff(team_id)))
  with check (case when thread_id is null then chat_member(team_id) else chat_in_thread(thread_id) end);

-- The stamp on insert: the real name, the chat's team, and no posting into a closed chat.
create or replace function team_messages_before_insert() returns trigger
  language plpgsql security definer set search_path = public
as $$
declare
  t chat_threads;
begin
  new.author_id := auth.uid();
  new.created_at := now();
  new.edited_at := null;
  new.deleted_at := null;
  new.body := btrim(new.body);
  if new.body = '' then raise exception 'empty message'; end if;
  if new.thread_id is not null then
    select * into t from chat_threads where id = new.thread_id;
    if t.closed_at is not null then raise exception 'this chat is closed'; end if;
    new.team_id := t.team_id;
  end if;
  new.author_name := chat_display_name(auth.uid());
  new.author_role := case when chat_staff(new.team_id) then 'staff' else 'family' end;
  return new;
end $$;

create or replace function team_messages_before_update() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  new.team_id := old.team_id;
  new.thread_id := old.thread_id;
  new.author_id := old.author_id;
  new.author_name := old.author_name;
  new.author_role := old.author_role;
  new.created_at := old.created_at;
  new.client_id := old.client_id;
  if old.deleted_at is not null then return old; end if;
  if new.deleted_at is not null then
    new.deleted_at := now();
    new.body := '';
    return new;
  end if;
  if new.body is distinct from old.body then
    if old.author_id is distinct from auth.uid() then raise exception 'only the author can edit a message'; end if;
    new.body := btrim(new.body);
    if new.body = '' then raise exception 'empty message'; end if;
    new.edited_at := now();
  end if;
  return new;
end $$;

-- ── The inbox: team chats, then private and group chats ──
drop function if exists chat_inbox();
create or replace function chat_inbox()
returns table (
  kind text, id uuid, team_id uuid, team_name text, title text, unread int,
  last_body text, last_author text, last_at timestamptz, members int, closed boolean, can_start boolean
)
  language sql stable security definer set search_path = public
as $$
  with mine as (
    select ur.team_id from user_roles ur where ur.user_id = auth.uid() and ur.team_id is not null
    union
    select p.team_id from players p
     where p.status = 'active' and p.team_id is not null and p.id in (select user_guardian_player_ids())
  ),
  team_rows as (
    select 'team'::text as kind, t.id, t.id as team_id, t.name as team_name, t.name as title,
      (select count(*)::int from team_messages m
        where m.team_id = t.id and m.thread_id is null and m.deleted_at is null and m.author_id is distinct from auth.uid()
          and m.created_at > coalesce(r.last_read_at, now() - interval '7 days')) as unread,
      last.body as last_body, chat_display_name(last.author_id) as last_author, last.created_at as last_at,
      null::int as members, false as closed, chat_can_start(t.id) as can_start
    from mine
    join teams t on t.id = mine.team_id and coalesce(t.status, 'active') = 'active'
    left join team_chat_reads r on r.team_id = t.id and r.user_id = auth.uid()
    left join lateral (
      select m.body, m.author_id, m.created_at from team_messages m
       where m.team_id = t.id and m.thread_id is null and m.deleted_at is null order by m.created_at desc limit 1
    ) last on true
  ),
  thread_rows as (
    select th.kind, th.id, th.team_id, tm.name as team_name,
      coalesce(
        th.title,
        (select string_agg(chat_display_name(o.user_id), ', ' order by chat_display_name(o.user_id))
           from chat_thread_members o where o.thread_id = th.id and o.user_id <> auth.uid())
      ) as title,
      (select count(*)::int from team_messages m
        where m.thread_id = th.id and m.deleted_at is null and m.author_id is distinct from auth.uid()
          and m.created_at > me.last_read_at) as unread,
      last.body, chat_display_name(last.author_id), last.created_at,
      (select count(*)::int from chat_thread_members o where o.thread_id = th.id),
      th.closed_at is not null, chat_can_start(th.team_id)
    from chat_thread_members me
    join chat_threads th on th.id = me.thread_id
    join teams tm on tm.id = th.team_id
    left join lateral (
      select m.body, m.author_id, m.created_at from team_messages m
       where m.thread_id = th.id and m.deleted_at is null order by m.created_at desc limit 1
    ) last on true
    where me.user_id = auth.uid()
  )
  select * from team_rows
  union all
  select * from thread_rows
  order by 9 desc nulls last, 5;
$$;
revoke all on function chat_inbox() from public, anon;
grant execute on function chat_inbox() to authenticated;

-- Thread membership changes reach open screens (a new chat appears, someone leaves).
alter table chat_thread_members replica identity full;
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'chat_thread_members') then
    alter publication supabase_realtime add table chat_thread_members;
  end if;
end $$;

-- ── Correct the names already stamped on messages ──
-- The update guard keeps stamped names as they are, so it steps aside for this one correction.
alter table team_messages disable trigger team_messages_before_update;
update team_messages m set author_name = chat_display_name(m.author_id)
 where m.author_id is not null and m.author_name is distinct from chat_display_name(m.author_id);
alter table team_messages enable trigger team_messages_before_update;
