-- Migration: open the team's game film site (dfc-game-film) from a manager account.
--
-- The film site is a static, end-to-end encrypted site: its games open with a key derived from the team
-- password, its coaches' area with a key from the coach password, and its scorekeeper screen with a key
-- from the scorekeeper password. Instead of handing those passwords around, the film's own tool
-- (dfc-game-film: tools/manager/manager.ts link) stores the derived keys here, once per team, and
-- film_access() hands each signed-in user only the keys their place on the team allows:
--
--   team key     anyone on the team: staff (user_team_ids()), guardians of an active player, scorekeepers
--   coach keys   head_coach / assistant_coach / team_manager of the team, club_admin of its club, super_admin
--   keeper keys  coaches as above, and the team's scorekeepers (the 'scorekeeper' team role)
--
-- The manager passes the keys to the film in the part of the link after "#", which browsers never send
-- to a server; the film stores them and removes them from the address straight away.
--
-- 'scorekeeper' is a team role assigned in Team Users like the others. It grants nothing in this app (the
-- app leaves it out of the roles that make someone staff, so a parent keeps the parent portal); it only
-- opens the film's scorekeeper screen.
--
-- Run this in the Supabase SQL editor. Safe to run again.

create table if not exists film_sites (
  team_id uuid primary key references teams(id) on delete cascade,
  site_url text not null,
  team_key text not null,        -- base64 of the 32-byte key the team password derives
  coach_keys jsonb,              -- { a: access key, e: notes key, c: breakdown key }
  keeper_keys jsonb,             -- { a: access key, e: log key, r: roster key }
  updated_at timestamptz not null default now()
);

-- The scorekeeper role.
alter table user_roles drop constraint if exists user_roles_role_check;
alter table user_roles
  add constraint user_roles_role_check
  check (role in ('super_admin', 'club_admin', 'club_manager', 'team_manager', 'treasurer', 'scheduler', 'head_coach', 'assistant_coach', 'fundraiser', 'scorekeeper', 'parent'));

-- Not reachable directly; film_access() is the only way in.
alter table film_sites enable row level security;
revoke all on film_sites from anon, authenticated;

create or replace function film_is_coach(p_team_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select is_super_admin()
    or exists (select 1 from user_roles ur
               where ur.user_id = auth.uid() and ur.team_id = p_team_id
                 and ur.role in ('head_coach', 'assistant_coach', 'team_manager'))
    or exists (select 1 from user_roles ur join teams t on t.club_id = ur.club_id
               where ur.user_id = auth.uid() and t.id = p_team_id and ur.role = 'club_admin');
$$;

create or replace function film_is_scorekeeper(p_team_id uuid) returns boolean
  language sql stable security definer set search_path = public
as $$
  select exists (select 1 from user_roles ur
                 where ur.user_id = auth.uid() and ur.team_id = p_team_id and ur.role = 'scorekeeper');
$$;

-- What the signed-in user may open for this team; null when the team has no film site or the user
-- isn't on the team.
create or replace function film_access(p_team_id uuid) returns jsonb
  language plpgsql stable security definer set search_path = public
as $$
declare
  s film_sites;
  coach boolean;
  keeper boolean;
begin
  if auth.uid() is null then return null; end if;
  select * into s from film_sites where team_id = p_team_id;
  if not found then return null; end if;
  coach := film_is_coach(p_team_id);
  keeper := coach or film_is_scorekeeper(p_team_id);
  if not (keeper
          or p_team_id in (select user_team_ids())
          or exists (select 1 from players p
                     where p.team_id = p_team_id and p.status = 'active'
                       and p.id in (select user_guardian_player_ids()))) then
    return null;
  end if;
  return jsonb_build_object(
    'siteUrl', s.site_url,
    'team', s.team_key,
    'coach', case when coach then s.coach_keys end,
    'keeper', case when keeper then s.keeper_keys end
  );
end $$;

revoke all on function film_is_coach(uuid), film_is_scorekeeper(uuid) from public, anon, authenticated;
revoke all on function film_access(uuid) from public, anon;
grant execute on function film_access(uuid) to authenticated;
