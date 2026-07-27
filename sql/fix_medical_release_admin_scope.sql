-- Restricts access to medical release forms/documents: only a player's guardian,
-- the team's team_manager, or a club_admin/super_admin may see them. Every other
-- team-level role (treasurer, scheduler, head_coach, assistant_coach, fundraiser)
-- previously had access via the general club-staff grant (club_id IN user_club_ids()),
-- which was too broad for sensitive medical data (allergies, conditions, insurance
-- policy numbers). Non-medical doc types (birth certificate, insurance card, etc.)
-- keep the existing broader club-staff access — this only tightens doc_type =
-- 'medical_release' rows in `documents` and all rows in `medical_forms`.
--
-- Mirrors the "team_admin was merged into team_manager" model from
-- merge_team_admin_role_migration.sql — "team admin" here means team_manager
-- (plus club_admin/super_admin), not club_manager or any team-level staff role.
--
-- Supersedes fix_documents_delete_rls_guardian_scope.sql — that file's guardian-
-- delete fix is folded in below with the doc_type split added on top. Do NOT run
-- fix_documents_delete_rls_guardian_scope.sql after this one; it would silently
-- re-broaden medical_release DELETE back to all club staff (both are
-- drop-then-create, so whichever runs last wins).
--
-- IMPORTANT — this only covers the `documents`/`medical_forms` TABLES. The actual
-- files live in the private `player-documents` Storage bucket, governed by
-- separate policies on storage.objects that this repo does not track (the bucket
-- itself was created by hand in the Supabase dashboard — see complete_schema.sql).
-- If storage.objects currently has no policy, or a broad "any authenticated user"
-- policy, a coach could still fetch a medical PDF directly via its storage path
-- even though they can no longer see the row that names that path. Run
-- fix_player_documents_storage_rls.sql as well to close that gap.

begin;

-- Helper: team IDs this user administers medical records for.
CREATE OR REPLACE FUNCTION user_medical_admin_team_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT team_id FROM user_roles
  WHERE user_id = auth.uid() AND team_id IS NOT NULL AND role = 'team_manager'
  UNION
  SELECT t.id FROM teams t
  JOIN user_roles ur ON ur.club_id = t.club_id
  WHERE ur.user_id = auth.uid() AND ur.role = 'club_admin'
$$;

GRANT EXECUTE ON FUNCTION user_medical_admin_team_ids() TO authenticated;

-- Helper: club IDs this user administers medical records for as club_admin.
-- Needed because players.team_id is nullable (status = 'prospect' tryout pool),
-- so a club_admin must still reach medical records via club_id when a player
-- has no team yet.
CREATE OR REPLACE FUNCTION user_medical_admin_club_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT club_id FROM user_roles
  WHERE user_id = auth.uid() AND club_id IS NOT NULL AND role = 'club_admin'
$$;

GRANT EXECUTE ON FUNCTION user_medical_admin_club_ids() TO authenticated;

-- documents
drop policy if exists "documents_select" on documents;
drop policy if exists "documents_insert" on documents;
drop policy if exists "documents_update" on documents;
drop policy if exists "documents_delete" on documents;

create policy "documents_select" on documents for select to authenticated
  using (
    is_super_admin()
    or player_id in (select user_guardian_player_ids())
    or (doc_type <> 'medical_release' and club_id in (select user_club_ids()))
    or (
      doc_type = 'medical_release'
      and (team_id in (select user_medical_admin_team_ids()) or club_id in (select user_medical_admin_club_ids()))
    )
  );

create policy "documents_insert" on documents for insert to authenticated
  with check (
    is_super_admin()
    or player_id in (select user_guardian_player_ids())
    or (doc_type <> 'medical_release' and club_id in (select user_club_ids()))
    or (
      doc_type = 'medical_release'
      and (team_id in (select user_medical_admin_team_ids()) or club_id in (select user_medical_admin_club_ids()))
    )
  );

create policy "documents_update" on documents for update to authenticated
  using (
    is_super_admin()
    or (doc_type <> 'medical_release' and club_id in (select user_club_ids()))
    or (
      doc_type = 'medical_release'
      and (team_id in (select user_medical_admin_team_ids()) or club_id in (select user_medical_admin_club_ids()))
    )
  );

create policy "documents_delete" on documents for delete to authenticated
  using (
    is_super_admin()
    or player_id in (select user_guardian_player_ids())
    or (doc_type <> 'medical_release' and club_id in (select user_club_ids()))
    or (
      doc_type = 'medical_release'
      and (team_id in (select user_medical_admin_team_ids()) or club_id in (select user_medical_admin_club_ids()))
    )
  );

-- medical_forms
drop policy if exists "medical_forms_select" on medical_forms;
drop policy if exists "medical_forms_insert" on medical_forms;
drop policy if exists "medical_forms_update" on medical_forms;
drop policy if exists "medical_forms_delete" on medical_forms;

create policy "medical_forms_select" on medical_forms for select to authenticated
  using (
    is_super_admin()
    or player_id in (select user_guardian_player_ids())
    or player_id in (
      select id from players
      where team_id in (select user_medical_admin_team_ids()) or club_id in (select user_medical_admin_club_ids())
    )
  );

create policy "medical_forms_insert" on medical_forms for insert to authenticated
  with check (
    is_super_admin()
    or player_id in (select user_guardian_player_ids())
    or player_id in (
      select id from players
      where team_id in (select user_medical_admin_team_ids()) or club_id in (select user_medical_admin_club_ids())
    )
  );

create policy "medical_forms_update" on medical_forms for update to authenticated
  using (
    is_super_admin()
    or player_id in (select user_guardian_player_ids())
    or player_id in (
      select id from players
      where team_id in (select user_medical_admin_team_ids()) or club_id in (select user_medical_admin_club_ids())
    )
  );

create policy "medical_forms_delete" on medical_forms for delete to authenticated
  using (
    is_super_admin()
    or player_id in (
      select id from players
      where team_id in (select user_medical_admin_team_ids()) or club_id in (select user_medical_admin_club_ids())
    )
  );

commit;
