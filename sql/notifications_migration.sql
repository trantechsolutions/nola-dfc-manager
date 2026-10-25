-- Migration: notifications sent by the server.
--
-- Until now the sender's own phone asked for each push after saving (a chat message, a schedule change, a
-- broadcast). If that phone closed the app, lost signal or the request failed, the change was saved and no one
-- was told. Now every notification is a row in `notifications`, written in the same save (by a trigger for chat,
-- by the app for broadcasts, schedule changes and compliance alerts), and the database hands it to the
-- notify-push edge function itself.
--
--   notifications              one row per notification: what to say, who it's for, and how sending went
--   notification_recipients()  the people a notification goes to
--   notify_dispatch()          posts a notification's id to the notify-push edge function (pg_net)
--   team_messages_notify       every new chat message becomes a notification
--
-- One-time setup, before or after running this (the URL is the project's own; the secret is any long random
-- string, also set as NOTIFY_PUSH_SECRET on the edge function):
--
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/notify-push', 'notify_push_url');
--   select vault.create_secret('<long random string>', 'notify_push_secret');
--
-- and deploy the function so the database can reach it without a user's sign-in token (it checks the secret
-- instead):
--
--   supabase secrets set NOTIFY_PUSH_SECRET=<the same long random string>
--   supabase functions deploy notify-push --no-verify-jwt
--
-- Until both exist, notifications are stored and wait; nothing is lost. Safe to run again.

create extension if not exists pg_net;

-- ── 1. The outbox ──
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('chat', 'schedule', 'broadcast', 'reminder', 'alert')),
  team_id uuid references teams(id) on delete cascade,
  thread_id uuid references chat_threads(id) on delete cascade,
  -- An alert about one player goes to that player's family (and the player, if they sign in themselves).
  player_id uuid references players(id) on delete cascade,
  -- Named people; when null the audience comes from the thread, the player or the team, in that order.
  user_ids uuid[],
  exclude_user_ids uuid[] not null default '{}',
  title text not null check (length(title) between 1 and 120),
  body text not null check (length(body) between 1 and 500),
  url text not null default '/' check (url like '/%'),
  -- Notifications that share a tag replace each other on the phone: a burst of chat messages shows as one.
  tag text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  status text not null default 'pending' check (status in ('pending', 'sending', 'sent', 'failed')),
  attempts int not null default 0,
  sent_count int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists notifications_open_idx on notifications (created_at) where status in ('pending', 'sending', 'failed');
create index if not exists notifications_team_idx on notifications (team_id, created_at desc);
alter table notifications enable row level security;

-- Who a notification reaches.
create or replace function notification_recipients(p_id uuid) returns setof uuid
  language sql stable security definer set search_path = public
as $$
  with n as (select * from notifications where id = p_id),
  audience as (
    select unnest(n.user_ids) as user_id from n where n.user_ids is not null
    union
    select m.user_id from n join chat_thread_members m on m.thread_id = n.thread_id
     where n.user_ids is null and n.thread_id is not null
    union
    select up.user_id from n
      join guardians g on g.player_id = n.player_id
      join user_profiles up on lower(up.email) = lower(g.email)
     where n.user_ids is null and n.thread_id is null and n.player_id is not null
    union
    select ur.user_id from n join user_roles ur on ur.team_id = n.team_id
     where n.user_ids is null and n.thread_id is null and n.player_id is null
    union
    select up.user_id from n
      join players p on p.team_id = n.team_id and p.status = 'active'
      join guardians g on g.player_id = p.id
      join user_profiles up on lower(up.email) = lower(g.email)
     where n.user_ids is null and n.thread_id is null and n.player_id is null
  )
  select distinct a.user_id from audience a, n
   where a.user_id is not null and not (a.user_id = any (n.exclude_user_ids));
$$;
revoke all on function notification_recipients(uuid) from public, anon, authenticated;
grant execute on function notification_recipients(uuid) to service_role;

-- ── 2. Handing a notification to the edge function ──
create or replace function notify_dispatch(p_id uuid) returns void
  language plpgsql security definer set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'notify_push_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_push_secret';
  -- Not set up yet: the row stays pending and goes out once it is.
  if v_url is null or v_secret is null then return; end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('id', p_id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', v_secret),
    timeout_milliseconds := 15000
  );
end $$;
revoke all on function notify_dispatch(uuid) from public, anon, authenticated;

create or replace function notifications_after_insert() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  perform notify_dispatch(new.id);
  return null;
end $$;
drop trigger if exists notifications_dispatch on notifications;
create trigger notifications_dispatch after insert on notifications
  for each row execute function notifications_after_insert();

-- ── 3. Chat messages ──
-- Private chats are titled with the sender's name (the reader already knows who they're talking to); team and
-- group chats with the chat's name and the sender in the body.
create or replace function team_messages_notify() returns trigger
  language plpgsql security definer set search_path = public
as $$
declare
  t chat_threads;
  v_author text := coalesce(nullif(btrim(new.author_name), ''), 'Someone');
  v_title text;
  v_body text;
begin
  if new.thread_id is null then
    select name into v_title from teams where id = new.team_id;
    v_body := v_author || ': ' || new.body;
  else
    select * into t from chat_threads where id = new.thread_id;
    if t.kind = 'direct' then
      v_title := v_author;
      v_body := new.body;
    else
      v_title := coalesce(nullif(btrim(t.title), ''), 'Group chat');
      v_body := v_author || ': ' || new.body;
    end if;
  end if;
  insert into notifications (kind, team_id, thread_id, exclude_user_ids, title, body, url, tag, created_by)
  values (
    'chat', new.team_id, new.thread_id, array[new.author_id],
    left(coalesce(nullif(btrim(v_title), ''), 'Team chat'), 120),
    left(v_body, 500),
    case when new.thread_id is null then '/chat?team=' || new.team_id else '/chat?chat=' || new.thread_id end,
    case when new.thread_id is null then 'chat-team-' || new.team_id else 'chat-' || new.thread_id end,
    new.author_id
  );
  return null;
end $$;
drop trigger if exists team_messages_notify on team_messages;
create trigger team_messages_notify after insert on team_messages
  for each row execute function team_messages_notify();

-- ── 4. What the app may write ──
-- Broadcasts, schedule changes and compliance alerts come from staff: anyone with a team role other than parent
-- or scorekeeper, the club's admins, super admins. Chat notifications only ever come from the trigger above.
create or replace function notify_staff_team(p_team_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select auth.uid() is not null and p_team_id is not null and (
    is_super_admin()
    or exists (select 1 from user_roles ur where ur.user_id = auth.uid() and ur.team_id = p_team_id
               and ur.role not in ('parent', 'scorekeeper'))
    or exists (select 1 from user_roles ur join teams t on t.club_id = ur.club_id
               where ur.user_id = auth.uid() and t.id = p_team_id and ur.role = 'club_admin')
  );
$$;
revoke all on function notify_staff_team(uuid) from public, anon;
grant execute on function notify_staff_team(uuid) to authenticated;

drop policy if exists notifications_insert on notifications;
create policy notifications_insert on notifications for insert to authenticated
  with check (
    kind in ('schedule', 'broadcast', 'alert')
    and created_by = auth.uid()
    and thread_id is null
    and user_ids is null
    and notify_staff_team(team_id)
    and (player_id is null or exists (select 1 from players p where p.id = player_id and p.team_id = notifications.team_id))
  );

-- Staff can see what went out to their team, and how it went.
drop policy if exists notifications_select on notifications;
create policy notifications_select on notifications for select to authenticated
  using (created_by = auth.uid() or (kind <> 'chat' and notify_staff_team(team_id)));

-- ── 5. Locking down sending ──
-- notify-push runs with the service role and used to send whatever any caller asked: the anon key is itself a
-- valid token, so anyone could push to any team. Now it only acts on a row id, only when the request carries
-- the shared secret from Vault (sent by notify_dispatch), and the rows themselves can only be written by staff
-- (policy above) or the chat trigger. On top of that, a cap: one person can queue at most 20 broadcasts,
-- schedule notices or alerts an hour, so a mistake (or a compromised account) can't flood every family.
create or replace function notifications_before_insert() returns trigger
  language plpgsql security definer set search_path = public
as $$
begin
  new.status := 'pending';
  new.attempts := 0;
  new.sent_count := 0;
  new.last_error := null;
  new.sent_at := null;
  new.created_at := now();
  if new.kind <> 'chat' and auth.uid() is not null and (
    select count(*) from notifications
     where created_by = auth.uid() and kind <> 'chat' and created_at > now() - interval '1 hour'
  ) >= 20 then
    raise exception 'too many notifications in the last hour — try again later';
  end if;
  return new;
end $$;
drop trigger if exists notifications_guard on notifications;
create trigger notifications_guard before insert on notifications
  for each row execute function notifications_before_insert();

-- No one edits or deletes a notification from the app; the edge function uses the service role.
drop policy if exists notifications_update on notifications;
drop policy if exists notifications_delete on notifications;

-- ── 6. The phone app (iOS and Android) ──
-- Web push doesn't exist inside the app, so each phone registers a Firebase Cloud Messaging token instead (FCM
-- also carries iOS notifications through Apple's service). One row per phone; a token belongs to whoever last
-- signed in on that phone, so a shared or handed-down phone follows its current owner.
create table if not exists device_tokens (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists device_tokens_user_idx on device_tokens (user_id);
alter table device_tokens enable row level security;
drop policy if exists device_tokens_own on device_tokens;
create policy device_tokens_own on device_tokens for select to authenticated using (user_id = auth.uid());

create or replace function register_device_token(p_token text, p_platform text) returns void
  language sql volatile security definer set search_path = public
as $$
  insert into device_tokens (token, user_id, platform)
  values (p_token, auth.uid(), p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, last_seen_at = now();
$$;

-- Holding the token is proof enough that it's your phone: signing out stops its notifications.
create or replace function unregister_device_token(p_token text) returns void
  language sql volatile security definer set search_path = public
as $$
  delete from device_tokens where token = p_token;
$$;
revoke all on function register_device_token(text, text), unregister_device_token(text) from public, anon;
grant execute on function register_device_token(text, text), unregister_device_token(text) to authenticated;

-- The browser's subscription is dropped on sign-out the same way, so a shared computer stops getting the last
-- person's notifications.
create or replace function unregister_push_subscription(p_endpoint text) returns void
  language sql volatile security definer set search_path = public
as $$
  delete from push_subscriptions where endpoint = p_endpoint;
$$;
revoke all on function unregister_push_subscription(text) from public, anon;
grant execute on function unregister_push_subscription(text) to authenticated;

-- ── 7. Schedule reminders ──
-- Every five minutes pg_cron looks for upcoming events and queues two reminders for each:
--   'day_before'  the evening before (from 6pm in the club's time zone), for everything on tomorrow's schedule
--   'soon'        two hours before it starts
-- Each reminder is stored with the event's start time, so a reminder goes out once per event and time — and
-- again if the event is moved. Cancelled events and events on inactive teams are skipped. The club's time zone
-- is clubs.settings->>'timezone' (an IANA name such as 'America/Chicago', the default).
create extension if not exists pg_cron;

alter table notifications add column if not exists event_id uuid references team_events(id) on delete cascade;
alter table notifications add column if not exists reminder text check (reminder in ('day_before', 'soon'));
alter table notifications add column if not exists event_at timestamptz;
create unique index if not exists notifications_reminder_once
  on notifications (event_id, reminder, event_at) where event_id is not null;

create or replace function notify_queue_reminders() returns int
  language plpgsql security definer set search_path = public
as $$
declare
  v_count int := 0;
  v_rows int;
begin
  with upcoming as (
    select e.id, e.team_id, e.title, e.location, e.event_date, e.arrival_minutes, tm.name as team_name,
           coalesce(nullif(c.settings->>'timezone', ''), 'America/Chicago') as tz
      from team_events e
      join teams tm on tm.id = e.team_id and coalesce(tm.status, 'active') = 'active'
      left join clubs c on c.id = tm.club_id
     where not coalesce(e.is_cancelled, false)
       and e.event_date > now() + interval '10 minutes'
       and e.event_date < now() + interval '36 hours'
  ),
  due as (
    select u.*, 'soon'::text as reminder from upcoming u
     where u.event_date <= now() + interval '2 hours'
    union all
    select u.*, 'day_before' from upcoming u
     where (u.event_date at time zone u.tz)::date = (now() at time zone u.tz)::date + 1
       and extract(hour from now() at time zone u.tz) >= 18
  )
  insert into notifications (kind, team_id, title, body, url, tag, event_id, reminder, event_at, created_by)
  select 'reminder', d.team_id,
         left(d.team_name || ' · ' || coalesce(nullif(btrim(d.title), ''), 'Event'), 120),
         left(
           case d.reminder when 'soon' then 'Starts at ' else 'Tomorrow at ' end
           || to_char(d.event_date at time zone d.tz, 'FMHH12:MI AM')
           || coalesce(' · ' || nullif(btrim(d.location), ''), '')
           || coalesce(' · arrive by ' || to_char((d.event_date - make_interval(mins => nullif(d.arrival_minutes, 0))) at time zone d.tz, 'FMHH12:MI AM'), ''),
           500),
         '/schedule', 'event-' || d.id, d.id, d.reminder, d.event_date, null
    from due d
  on conflict (event_id, reminder, event_at) where event_id is not null do nothing;
  get diagnostics v_rows = row_count;
  v_count := v_count + v_rows;
  return v_count;
end $$;
revoke all on function notify_queue_reminders() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'notify-reminders') then
    perform cron.unschedule('notify-reminders');
  end if;
  perform cron.schedule('notify-reminders', '*/5 * * * *', 'select notify_queue_reminders()');
end $$;

-- ── 8. Delivery records and retries ──
-- One row per notification per device: whether it got there, and why not. A notification that couldn't reach
-- some devices for a temporary reason (the push service busy or down, a timeout) is marked 'failed' and sent
-- again — only to the devices still missing it — up to four tries with a growing wait. Something that never got
-- picked up at all (the edge function was down when it was written) is picked up by the same sweep.
create table if not exists notification_deliveries (
  notification_id uuid not null references notifications(id) on delete cascade,
  -- The web push endpoint or the phone's FCM token.
  target text not null,
  channel text not null check (channel in ('web', 'app')),
  user_id uuid references auth.users(id) on delete cascade,
  status text not null check (status in ('sent', 'failed', 'gone')),
  error text,
  attempts int not null default 1,
  updated_at timestamptz not null default now(),
  primary key (notification_id, target)
);
create index if not exists notification_deliveries_user_idx on notification_deliveries (user_id, updated_at desc);
alter table notification_deliveries enable row level security;
-- People can see what was sent to their own devices; staff see the rest through the notification's own counts.
drop policy if exists notification_deliveries_own on notification_deliveries;
create policy notification_deliveries_own on notification_deliveries for select to authenticated using (user_id = auth.uid());

alter table notifications add column if not exists attempted_at timestamptz;

create or replace function notify_retry() returns int
  language plpgsql security definer set search_path = public
as $$
declare
  r record;
  v_count int := 0;
begin
  for r in
    select id from notifications
     where created_at > now() - interval '24 hours'
       and (
         (status = 'pending' and created_at < now() - interval '2 minutes')
         or (status = 'sending' and attempted_at < now() - interval '10 minutes')
         or (status = 'failed' and attempts < 4 and attempted_at < now() - make_interval(mins => 5 * attempts))
       )
     order by created_at
     limit 200
  loop
    perform notify_dispatch(r.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke all on function notify_retry() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'notify-retry') then
    perform cron.unschedule('notify-retry');
  end if;
  perform cron.schedule('notify-retry', '*/5 * * * *', 'select notify_retry()');
  -- Three months of history is plenty to trace a missed notification.
  if exists (select 1 from cron.job where jobname = 'notify-prune') then
    perform cron.unschedule('notify-prune');
  end if;
  perform cron.schedule('notify-prune', '17 4 * * *',
    $job$delete from notifications where created_at < now() - interval '90 days'$job$);
end $$;

-- Saving this browser's subscription for whoever is signed in (a subscription that moved to a new account, or
-- was renewed by the browser, takes the current owner).
create or replace function save_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void
  language sql volatile security definer set search_path = public
as $$
  insert into push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
$$;
revoke all on function save_push_subscription(text, text, text) from public, anon;
grant execute on function save_push_subscription(text, text, text) to authenticated;

-- ── 9. Reaching the right people, and letting them turn things down ──
-- Families: a guardian used to be matched to an account only when the email on the child's record equalled the
-- email on the account's profile. Now the account's sign-in email or phone counts too, and players who sign in
-- themselves get their team's notifications.
--
-- Mutes: each person can turn off chat, schedule-change or reminder notifications, or silence one chat.
-- Broadcasts from staff and alerts about their own child always come through.
--   scope  'kind:chat' | 'kind:schedule' | 'kind:reminder' | 'team-chat:<team id>' | 'thread:<thread id>'
create table if not exists notification_mutes (
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  scope text not null check (scope ~ '^(kind:(chat|schedule|reminder)|team-chat:[0-9a-f-]{36}|thread:[0-9a-f-]{36})$'),
  created_at timestamptz not null default now(),
  primary key (user_id, scope)
);
alter table notification_mutes enable row level security;
drop policy if exists notification_mutes_own on notification_mutes;
create policy notification_mutes_own on notification_mutes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- The accounts that are a family of a player: guardian email or phone against the account's profile or sign-in.
create or replace function notify_family_user_ids(p_player_ids uuid[]) returns setof uuid
  language sql stable security definer set search_path = public, auth
as $$
  select up.user_id from guardians g join user_profiles up on lower(up.email) = lower(btrim(g.email))
   where g.player_id = any (p_player_ids) and g.email is not null
  union
  select u.id from guardians g join auth.users u on lower(u.email) = lower(btrim(g.email))
   where g.player_id = any (p_player_ids) and g.email is not null
  union
  select u.id from guardians g join auth.users u on norm_phone(u.phone) = norm_phone(g.phone)
   where g.player_id = any (p_player_ids) and g.phone is not null and u.phone is not null
  union
  -- The player's own account (the email or phone on their roster entry).
  select u.id from players p join auth.users u
    on (p.email is not null and lower(u.email) = lower(btrim(p.email)))
    or (p.phone is not null and u.phone is not null and norm_phone(u.phone) = norm_phone(p.phone))
   where p.id = any (p_player_ids);
$$;
revoke all on function notify_family_user_ids(uuid[]) from public, anon, authenticated;

create or replace function notification_recipients(p_id uuid) returns setof uuid
  language sql stable security definer set search_path = public
as $$
  with n as (select * from notifications where id = p_id),
  audience as (
    select unnest(n.user_ids) as user_id from n where n.user_ids is not null
    union
    select m.user_id from n join chat_thread_members m on m.thread_id = n.thread_id
     where n.user_ids is null and n.thread_id is not null
    union
    select f from n, notify_family_user_ids(array[n.player_id]) f
     where n.user_ids is null and n.thread_id is null and n.player_id is not null
    union
    select ur.user_id from n join user_roles ur on ur.team_id = n.team_id
     where n.user_ids is null and n.thread_id is null and n.player_id is null
    union
    select f from n, notify_family_user_ids(array(
      select p.id from players p where p.team_id = n.team_id and p.status = 'active')) f
     where n.user_ids is null and n.thread_id is null and n.player_id is null
  )
  select distinct a.user_id from audience a, n
   where a.user_id is not null
     and not (a.user_id = any (n.exclude_user_ids))
     and not exists (
       select 1 from notification_mutes m
        where m.user_id = a.user_id
          and m.scope in (
            'kind:' || n.kind,
            case when n.kind = 'chat' and n.thread_id is null then 'team-chat:' || n.team_id end,
            case when n.kind = 'chat' and n.thread_id is not null then 'thread:' || n.thread_id end
          )
     );
$$;
revoke all on function notification_recipients(uuid) from public, anon, authenticated;
grant execute on function notification_recipients(uuid) to service_role;
