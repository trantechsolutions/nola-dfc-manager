-- SUPERSEDED by fix_medical_release_admin_scope.sql, which recreates
-- documents_delete with this same guardian scope PLUS the medical_release
-- doc_type split (team_manager/club_admin/super_admin only for medical docs).
--
-- This file is kept only so the original bug writeup below stays discoverable;
-- its policy definition has been updated in place to match the superseding
-- migration exactly, so running either file (in either order, any number of
-- times) converges on the same documents_delete definition. Prefer running
-- fix_medical_release_admin_scope.sql — it does strictly more.
--
-- Original bug: parent-uploaded documents piling up as duplicates instead of
-- being replaced (e.g. re-signing a Medical Release shows multiple rows in the
-- Documents list even though medical_forms only ever holds one row per
-- player+season).
--
-- Root cause: documents_insert/documents_select already grant guardians
-- access via player_id IN user_guardian_player_ids(), but documents_delete
-- was scoped to club staff/super_admin only. A guardian's DELETE under RLS
-- matches zero rows and returns no error (not a thrown exception), so the
-- "remove existing medical_release doc before uploading the new one" cleanup
-- in MedicalReleaseForm.jsx silently no-ops every time a parent re-signs,
-- and the same gap makes the parent-facing trash button in ParentView.jsx a
-- silent no-op too. This brings documents_delete in line with the insert
-- policy's guardian scope.

begin;

drop policy if exists "documents_delete" on documents;

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

commit;
