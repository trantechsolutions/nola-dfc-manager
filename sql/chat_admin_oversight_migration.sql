-- Migration: team admins can read their teams' private and group chats.
--
-- A team's administrators (chat_can_manage(): the team's manager, the club's admins, super admins) can read
-- every private and group chat on that team, so no conversation between an adult and a family happens out of
-- their sight. They read and moderate; they don't post unless they're in the chat:
--
--   - chat_threads, chat_thread_members and the chats' messages are readable by them
--   - chat_oversight(team) lists the team's chats they aren't in, for the "Review private chats" screen
--   - they can remove a message, and close a chat
--
-- Members are told: the new-chat screen says team admins can read private chats.
--
-- Needs sql/chat_threads_migration.sql first. Run this in the Supabase SQL editor. Safe to run again.

create or replace function chat_thread_team(p_thread_id uuid) returns uuid
  language sql stable security definer set search_path = public
as $$ select team_id from chat_threads where id = p_thread_id $$;
revoke all on function chat_thread_team(uuid) from public, anon;
grant execute on function chat_thread_team(uuid) to authenticated;

drop policy if exists chat_threads_select on chat_threads;
create policy chat_threads_select on chat_threads for select to authenticated
  using (chat_in_thread(id) or chat_can_manage(team_id));

drop policy if exists chat_thread_members_select on chat_thread_members;
create policy chat_thread_members_select on chat_thread_members for select to authenticated
  using (chat_in_thread(thread_id) or chat_can_manage(chat_thread_team(thread_id)));

drop policy if exists team_messages_select on team_messages;
create policy team_messages_select on team_messages for select to authenticated
  using (case when thread_id is null then chat_member(team_id)
              else chat_in_thread(thread_id) or chat_can_manage(team_id) end);

-- Removing: the author, staff in the team chat, a team admin anywhere on the team. (Editing stays the
-- author's alone; the update trigger enforces it.)
drop policy if exists team_messages_update on team_messages;
create policy team_messages_update on team_messages for update to authenticated
  using (author_id = auth.uid() or (thread_id is null and chat_staff(team_id)) or chat_can_manage(team_id))
  with check (case when thread_id is null then chat_member(team_id)
                   else chat_in_thread(thread_id) or chat_can_manage(team_id) end);

-- Closing: the person who started it, staff in it, or a team admin.
create or replace function chat_close(p_thread_id uuid) returns void
  language plpgsql volatile security definer set search_path = public
as $$
declare
  t chat_threads;
begin
  select * into t from chat_threads where id = p_thread_id;
  if not found or not (
       chat_can_manage(t.team_id)
       or (chat_in_thread(p_thread_id) and (t.created_by = auth.uid() or chat_staff(t.team_id)))
     ) then
    raise exception 'only the person who started this chat, staff in it or a team admin can close it' using errcode = '42501';
  end if;
  update chat_threads set closed_at = now(), closed_by = auth.uid() where id = p_thread_id and closed_at is null;
end $$;

-- A team's private and group chats that this admin isn't in, newest first. Same columns as chat_inbox().
create or replace function chat_oversight(p_team_id uuid)
returns table (
  kind text, id uuid, team_id uuid, team_name text, title text, unread int,
  last_body text, last_author text, last_at timestamptz, members int, closed boolean, can_start boolean
)
  language sql stable security definer set search_path = public
as $$
  select th.kind, th.id, th.team_id, tm.name,
    coalesce(
      th.title,
      (select string_agg(chat_display_name(o.user_id), ', ' order by chat_display_name(o.user_id))
         from chat_thread_members o where o.thread_id = th.id)
    ),
    0, last.body, chat_display_name(last.author_id), last.created_at,
    (select count(*)::int from chat_thread_members o where o.thread_id = th.id),
    th.closed_at is not null, false
  from chat_threads th
  join teams tm on tm.id = th.team_id
  left join lateral (
    select m.body, m.author_id, m.created_at from team_messages m
     where m.thread_id = th.id and m.deleted_at is null order by m.created_at desc limit 1
  ) last on true
  where th.team_id = p_team_id
    and chat_can_manage(p_team_id)
    and not exists (select 1 from chat_thread_members me where me.thread_id = th.id and me.user_id = auth.uid())
  order by last.created_at desc nulls last, th.created_at desc;
$$;
revoke all on function chat_oversight(uuid) from public, anon;
grant execute on function chat_oversight(uuid) to authenticated;

-- The inbox tells the app, per team chat, whether this person is one of the team's admins.
drop function if exists chat_inbox();
create or replace function chat_inbox()
returns table (
  kind text, id uuid, team_id uuid, team_name text, title text, unread int,
  last_body text, last_author text, last_at timestamptz, members int, closed boolean, can_start boolean,
  can_manage boolean
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
      null::int as members, false as closed, chat_can_start(t.id) as can_start, chat_can_manage(t.id) as can_manage
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
      th.closed_at is not null, chat_can_start(th.team_id), chat_can_manage(th.team_id)
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
