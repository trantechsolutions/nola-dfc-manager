-- Migration: scorekeeper stat logs kept under the signed-in manager account.
--
-- The game film's scorekeeper screen (dfc-game-film) writes its stat logs to keeper_log, encrypted in the
-- browser. Until now every write was authorised by the scorekeeper password's access key, so the log
-- couldn't say who kept it. Now the manager gives a coach or scorekeeper a token for their own account
-- when they press "Keep stats" (keeper_device_token), and the film sends entries with it
-- (keeper_append_as / keeper_list_as / keeper_forget_as):
--
--   - each entry records the team and who sent it (keeper_log.team_id, created_by);
--   - the token stops working when it expires (30 days) or the account loses the role;
--   - the database still never sees a player, a game or a stat: entries stay encrypted as before.
--
-- The password path (keeper_append etc., tools/keeper/setup.sql) still works, for a volunteer without an
-- account. Its entries have no team or author; the _as functions read them as this team's, since one film
-- site serves one team.
--
-- Needs the scorekeeper tables (dfc-game-film: manager.ts setup-sql) and sql/game_film_migration.sql first.
-- Run this in the Supabase SQL editor. Safe to run again.

alter table public.keeper_log add column if not exists team_id uuid references public.teams(id) on delete cascade;
alter table public.keeper_log add column if not exists created_by uuid references auth.users(id) on delete set null;
create index if not exists keeper_log_team_idx on public.keeper_log (team_id);

-- One row per token handed out; only its SHA-256 is kept.
create table if not exists public.keeper_devices (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists keeper_devices_user_idx on public.keeper_devices (user_id);
alter table public.keeper_devices enable row level security;
revoke all on public.keeper_devices from anon, authenticated;

-- May this account keep stats for this team? The film's own rule (film_access): the team's coaches and
-- team manager, its club's admins, super admins, and the team's scorekeepers.
create or replace function public.film_user_can_keep(p_user uuid, p_team_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (select 1 from user_roles ur
                 where ur.user_id = p_user and ur.team_id = p_team_id
                   and ur.role in ('head_coach', 'assistant_coach', 'team_manager', 'scorekeeper'))
    or exists (select 1 from user_roles ur join teams t on t.club_id = ur.club_id
               where ur.user_id = p_user and t.id = p_team_id and ur.role = 'club_admin')
    or exists (select 1 from user_roles ur left join user_profiles up on up.user_id = ur.user_id
               where ur.user_id = p_user and ur.role = 'super_admin' and coalesce(up.is_active, true));
$$;

-- Called by the manager (signed in) when it builds the "Keep stats" link.
create or replace function public.keeper_device_token(p_team_id uuid) returns text
  language plpgsql volatile security definer set search_path = public
as $$
declare tok text;
begin
  if auth.uid() is null or not film_user_can_keep(auth.uid(), p_team_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from keeper_devices where user_id = auth.uid() and expires_at < now();
  tok := encode(extensions.gen_random_bytes(32), 'hex');
  insert into keeper_devices (token_hash, user_id, team_id, expires_at)
    values (encode(extensions.digest(tok, 'sha256'), 'hex'), auth.uid(), p_team_id, now() + interval '30 days');
  return tok;
end $$;

-- The account and team a token stands for, while it's valid and the account may still keep stats.
create or replace function public.keeper_device(p_token text, out user_id uuid, out team_id uuid)
  language plpgsql stable security definer set search_path = public
as $$
begin
  select d.user_id, d.team_id into user_id, team_id from keeper_devices d
    where d.token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') and d.expires_at > now();
  if user_id is null or not film_user_can_keep(user_id, team_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
end $$;

-- p_rows: [{ "id": uuid, "scope": hex, "data": base64 }, …], at most 500 per call (as keeper_append).
create or replace function public.keeper_append_as(p_token text, p_rows jsonb) returns int
  language plpgsql security definer set search_path = public
as $$
declare d record; n int;
begin
  d := keeper_device(p_token);
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 500 then raise exception 'bad rows' using errcode = '22023'; end if;
  insert into keeper_log (id, scope, data, team_id, created_by)
    select (r->>'id')::uuid, r->>'scope', r->>'data', d.team_id, d.user_id from jsonb_array_elements(p_rows) r
    on conflict (id) do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.keeper_list_as(p_token text, p_scope text)
  returns table (id uuid, scope text, data text)
  language plpgsql stable security definer set search_path = public
as $$
declare d record;
begin
  d := keeper_device(p_token);
  return query select l.id, l.scope, l.data from keeper_log l
    where (l.team_id = d.team_id or l.team_id is null) and (p_scope is null or l.scope = p_scope)
    order by l.created_at;
end $$;

create or replace function public.keeper_forget_as(p_token text, p_scope text) returns int
  language plpgsql security definer set search_path = public
as $$
declare d record; n int;
begin
  d := keeper_device(p_token);
  delete from keeper_log l where l.scope = p_scope and (l.team_id = d.team_id or l.team_id is null);
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.film_user_can_keep(uuid, uuid), public.keeper_device(text) from public, anon, authenticated;
revoke all on function public.keeper_device_token(uuid) from public, anon;
grant execute on function public.keeper_device_token(uuid) to authenticated;
-- The token is the credential (the film has no manager sign-in of its own), so anon may call these.
revoke all on function public.keeper_append_as(text, jsonb), public.keeper_list_as(text, text), public.keeper_forget_as(text, text) from public;
grant execute on function public.keeper_append_as(text, jsonb), public.keeper_list_as(text, text), public.keeper_forget_as(text, text) to anon, authenticated;
