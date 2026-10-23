-- Migration: close the club-wide access that any team role was getting, and stop role self-promotion.
--
-- What was wrong (checked against the live database, 2026-10-22):
--
--   user_club_ids() returns the club of EVERY role a user holds, team roles included. Policies on 17 tables
--   use it as "club staff", so a scorekeeper (or a 'parent' team role) got club-wide read and write on
--   players, guardians, documents, medical forms, evaluations, categories, teams, invitations and user_roles.
--
--   Worst of it, user_roles_insert allowed any row whose club_id is in user_club_ids(): anyone holding any
--   team role could insert { role: 'club_admin', club_id: <their club> } for themselves and become a club
--   admin. Invitations, team creation/deletion and club settings had the same hole for every team role.
--
-- What this changes:
--
--   1. user_club_ids() no longer counts 'parent' or 'scorekeeper' team roles. Neither is staff; their access
--      comes from being a player's guardian (user_guardian_player_ids()) or, for a scorekeeper, the game film.
--      Every staff role keeps exactly the club-wide access it had. A scorekeeper can still read their own
--      team's and club's rows (teams_select, clubs_select below), which the app needs to show the team.
--   2. Assigning roles (user_roles) and inviting people (invitations): a super admin anywhere; a club admin
--      within their club; a club manager or the team's manager for team roles on that team only. Nobody but a
--      super admin grants super_admin, and only a club admin grants club-level roles. Someone accepting an
--      invitation may still add the one role they were invited to.
--   3. Teams: created by a club's admins or managers, deleted by its admins, edited by them or by the team's
--      manager or scheduler (the Team Settings and schedule screens). Clubs: edited by their club admins.
--
-- Not covered here, and still needed (both were written earlier and are not applied on the live database):
--   sql/fix_medical_release_admin_scope.sql   medical forms readable by every staff role in the club
--   sql/fix_player_documents_storage_rls.sql  the player-documents bucket readable by ANY signed-in user
-- Run those two after this one.
--
-- Run this in the Supabase SQL editor. Safe to run again.

begin;

-- ── 1. Club-wide access is for staff ──
create or replace function user_club_ids() returns setof uuid
  language sql stable security definer set search_path = public
as $$
  select distinct coalesce(ur.club_id, t.club_id)
    from user_roles ur
    left join teams t on ur.team_id = t.id
   where ur.user_id = auth.uid()
     and (ur.club_id is not null or t.club_id is not null)
     and ur.role not in ('parent', 'scorekeeper');
$$;

-- Any role on a team still reads that team's row and its club's (name, colours, schedule settings).
drop policy if exists "teams_select" on teams;
create policy "teams_select" on teams for select to authenticated
  using (
    is_super_admin()
    or club_id in (select user_club_ids())
    or id in (select team_id from user_roles where user_id = auth.uid() and team_id is not null)
    or id in (select team_id from players where id in (select user_guardian_player_ids()))
  );

drop policy if exists "clubs_select" on clubs;
create policy "clubs_select" on clubs for select to authenticated
  using (
    is_super_admin()
    or id in (select user_club_ids())
    or id in (select t.club_id from user_roles ur join teams t on t.id = ur.team_id where ur.user_id = auth.uid())
    or id in (select club_id from players where id in (select user_guardian_player_ids()))
  );

-- ── 2. Who may grant a role ──
create or replace function can_grant_role(p_club_id uuid, p_team_id uuid, p_role text) returns boolean
  language sql stable security definer set search_path = public
as $$
  select is_super_admin()
      or (p_role <> 'super_admin' and (
            -- A club-level role: the club's admins.
            (p_team_id is null and p_club_id is not null and has_club_role(p_club_id, 'club_admin'))
            -- A team role: the club's admins or managers, or the team's manager.
         or (p_team_id is not null and p_role not in ('super_admin', 'club_admin', 'club_manager')
             and has_team_role(p_team_id, array['team_manager']))
         ));
$$;
revoke all on function can_grant_role(uuid, uuid, text) from public, anon;
grant execute on function can_grant_role(uuid, uuid, text) to authenticated;

drop policy if exists "user_roles_insert" on user_roles;
create policy "user_roles_insert" on user_roles for insert to authenticated
  with check (
    can_grant_role(club_id, team_id, role)
    -- Accepting an invitation: the one role it names, for yourself.
    or (user_id = auth.uid() and role <> 'super_admin' and exists (
          select 1 from invitations i
           where i.status = 'pending'
             and lower(i.email) = lower(auth.jwt() ->> 'email')
             and i.role = user_roles.role
             and coalesce(i.team_id, '00000000-0000-0000-0000-000000000000') = coalesce(user_roles.team_id, '00000000-0000-0000-0000-000000000000')
             and (user_roles.team_id is not null or i.club_id = user_roles.club_id)
       ))
  );

drop policy if exists "user_roles_update" on user_roles;
create policy "user_roles_update" on user_roles for update to authenticated
  using (can_grant_role(club_id, team_id, role))
  with check (can_grant_role(club_id, team_id, role));

drop policy if exists "user_roles_delete" on user_roles;
create policy "user_roles_delete" on user_roles for delete to authenticated
  using (can_grant_role(club_id, team_id, role) or user_id = auth.uid());

-- ── Invitations: the same people who may grant the role ──
drop policy if exists "invitations_select" on invitations;
create policy "invitations_select" on invitations for select to authenticated
  using (
    is_super_admin()
    or (club_id is not null and has_club_role(club_id, 'club_admin'))
    or (club_id is not null and has_club_role(club_id, 'club_manager'))
    or (team_id is not null and has_team_role(team_id, array['team_manager']))
    -- The invited person reads their own invitation to accept it.
    or lower(email) = lower(auth.jwt() ->> 'email')
  );

drop policy if exists "invitations_insert" on invitations;
create policy "invitations_insert" on invitations for insert to authenticated
  with check (
    can_grant_role(case when team_id is null then club_id end, team_id, role)
    and (team_id is null or club_id is null or club_id = (select t.club_id from teams t where t.id = team_id))
  );

drop policy if exists "invitations_delete" on invitations;
create policy "invitations_delete" on invitations for delete to authenticated
  using (can_grant_role(case when team_id is null then club_id end, team_id, role));

-- ── 3. Teams and clubs ──
drop policy if exists "teams_insert" on teams;
create policy "teams_insert" on teams for insert to authenticated
  with check (is_super_admin() or has_club_role(club_id, 'club_admin') or has_club_role(club_id, 'club_manager'));

drop policy if exists "teams_update" on teams;
create policy "teams_update" on teams for update to authenticated
  using (is_super_admin() or has_team_role(id, array['team_manager', 'scheduler']))
  with check (is_super_admin() or has_team_role(id, array['team_manager', 'scheduler']));

drop policy if exists "teams_delete" on teams;
create policy "teams_delete" on teams for delete to authenticated
  using (is_super_admin() or has_club_role(club_id, 'club_admin'));

drop policy if exists "clubs_update" on clubs;
create policy "clubs_update" on clubs for update to authenticated
  using (is_super_admin() or has_club_role(id, 'club_admin'))
  with check (is_super_admin() or has_club_role(id, 'club_admin'));

commit;
