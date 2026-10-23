-- Migration: team chat.
--
-- One conversation per team for its staff and families: text messages, live as they're sent, with an unread
-- count per team for the chat bubble in the top bar and a push notification to everyone else on the team.
--
--   team_messages    one row per message. Author name and role are stamped on insert, so a message keeps the
--                    name it was sent under. Messages are never hard-deleted: removing one blanks it and leaves
--                    "message removed" in its place, so a conversation can't be quietly rewritten.
--   team_chat_reads  how far each person has read in each team's chat
--   chat_inbox()     the teams this person chats in, each with its unread count and latest message
--
-- Who is in a team's chat: anyone with a role on the team, a club admin of its club, a super admin, and the
-- guardians of its active players. The same people can read and post. An author can edit or remove their own
-- message; staff can remove anyone's.
--
-- Run this in the Supabase SQL editor after sql/enable_realtime.sql. Safe to run again.

create table if not exists team_messages (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references teams(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null default auth.uid(),
  author_name text not null default '',
  author_role text not null default 'family' check (author_role in ('staff', 'family')),
  body text not null default '' check (length(body) <= 2000),
  -- Set by the sending phone, so a message retried after a dropped connection is stored once.
  client_id text,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);
create index if not exists team_messages_team_idx on team_messages (team_id, created_at desc);
create unique index if not exists team_messages_client_idx on team_messages (author_id, client_id) where client_id is not null;

create table if not exists team_chat_reads (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  team_id uuid not null references teams(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, team_id)
);

-- ── Who's in the chat ──
create or replace function chat_member(p_team_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null and (
    is_super_admin()
    or exists (select 1 from user_roles ur where ur.user_id = auth.uid() and ur.team_id = p_team_id)
    or exists (select 1 from user_roles ur join teams t on t.club_id = ur.club_id
               where ur.user_id = auth.uid() and t.id = p_team_id and ur.role = 'club_admin')
    or exists (select 1 from players p
               where p.team_id = p_team_id and p.status = 'active' and p.id in (select user_guardian_player_ids()))
  );
$$;

-- Staff in the chat: any team role other than parent or scorekeeper, the club's admins, super admins.
create or replace function chat_staff(p_team_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null and (
    is_super_admin()
    or exists (select 1 from user_roles ur where ur.user_id = auth.uid() and ur.team_id = p_team_id
               and ur.role not in ('parent', 'scorekeeper'))
    or exists (select 1 from user_roles ur join teams t on t.club_id = ur.club_id
               where ur.user_id = auth.uid() and t.id = p_team_id and ur.role = 'club_admin')
  );
$$;
revoke all on function chat_member(uuid), chat_staff(uuid) from public, anon;
grant execute on function chat_member(uuid), chat_staff(uuid) to authenticated;

-- ── Stamping and guarding messages ──
create or replace function team_messages_before_insert() returns trigger
  language plpgsql security definer set search_path = public
as $$
declare
  v_name text;
begin
  new.author_id := auth.uid();
  new.created_at := now();
  new.edited_at := null;
  new.deleted_at := null;
  new.body := btrim(new.body);
  if new.body = '' then raise exception 'empty message'; end if;
  select nullif(btrim(display_name), '') into v_name from user_profiles where user_id = auth.uid();
  if v_name is null then
    -- A guardian without a profile name: the name the club has for them.
    select g.name into v_name from guardians g
      join user_profiles up on lower(g.email) = lower(up.email)
     where up.user_id = auth.uid() and nullif(btrim(g.name), '') is not null
     limit 1;
  end if;
  if v_name is null then
    select split_part(email, '@', 1) into v_name from user_profiles where user_id = auth.uid();
  end if;
  new.author_name := coalesce(v_name, '');
  new.author_role := case when chat_staff(new.team_id) then 'staff' else 'family' end;
  return new;
end $$;

-- Only the text changes: an author edits their own words; removing (by the author or staff) blanks them.
create or replace function team_messages_before_update() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  new.team_id := old.team_id;
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

drop trigger if exists team_messages_before_insert on team_messages;
create trigger team_messages_before_insert before insert on team_messages
  for each row execute function team_messages_before_insert();
drop trigger if exists team_messages_before_update on team_messages;
create trigger team_messages_before_update before update on team_messages
  for each row execute function team_messages_before_update();

-- ── Row-level security ──
alter table team_messages enable row level security;
alter table team_chat_reads enable row level security;
revoke all on team_messages, team_chat_reads from anon;
grant select, insert, update on team_messages to authenticated;
grant select, insert, update on team_chat_reads to authenticated;

drop policy if exists team_messages_select on team_messages;
create policy team_messages_select on team_messages for select to authenticated using (chat_member(team_id));
drop policy if exists team_messages_insert on team_messages;
create policy team_messages_insert on team_messages for insert to authenticated with check (chat_member(team_id));
drop policy if exists team_messages_update on team_messages;
create policy team_messages_update on team_messages for update to authenticated
  using (author_id = auth.uid() or chat_staff(team_id))
  with check (chat_member(team_id));

drop policy if exists team_chat_reads_own on team_chat_reads;
create policy team_chat_reads_own on team_chat_reads for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and chat_member(team_id));

-- ── The inbox ──
-- The teams this person chats in, newest conversation first. Club-wide roles open any of the club's team chats,
-- but only teams they're directly on (or a guardian on) are listed and counted, so a club admin's bubble isn't
-- every team's chatter. Someone who has never opened a team's chat counts the last week as unread.
create or replace function chat_inbox()
returns table (team_id uuid, team_name text, unread int, last_body text, last_author text, last_at timestamptz)
  language sql stable security definer set search_path = public
as $$
  with mine as (
    select ur.team_id from user_roles ur where ur.user_id = auth.uid() and ur.team_id is not null
    union
    select p.team_id from players p
     where p.status = 'active' and p.team_id is not null and p.id in (select user_guardian_player_ids())
  )
  select t.id, t.name,
    (select count(*)::int from team_messages m
      where m.team_id = t.id and m.deleted_at is null and m.author_id is distinct from auth.uid()
        and m.created_at > coalesce(r.last_read_at, now() - interval '7 days')),
    last.body, last.author_name, last.created_at
  from mine
  join teams t on t.id = mine.team_id and coalesce(t.status, 'active') = 'active'
  left join team_chat_reads r on r.team_id = t.id and r.user_id = auth.uid()
  left join lateral (
    select m.body, m.author_name, m.created_at from team_messages m
     where m.team_id = t.id and m.deleted_at is null order by m.created_at desc limit 1
  ) last on true
  order by last.created_at desc nulls last, t.name;
$$;
revoke all on function chat_inbox() from public, anon;
grant execute on function chat_inbox() to authenticated;

-- ── Live updates ──
alter table team_messages replica identity full;
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'team_messages') then
    alter publication supabase_realtime add table team_messages;
  end if;
end $$;
