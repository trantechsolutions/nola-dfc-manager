-- Closes a gap in fix_medical_release_admin_scope.sql: that migration tightens
-- RLS on the `documents` and `medical_forms` TABLES, but the actual PDF/image
-- bytes live in the private `player-documents` Storage bucket, which is
-- governed by its own RLS policies on storage.objects — a separate policy
-- surface this repo has never scripted (the bucket was created by hand in the
-- Supabase dashboard; see the note in complete_schema.sql). Table-level RLS has
-- ZERO effect on storage.objects.
--
-- Both signed-URL creation (getDocumentUrl / createSignedUrl) and direct blob
-- download (downloadDocumentBlob / storage.download) are checked against
-- storage.objects policies, not the documents table. Without this, hiding a
-- medical_release row from a coach only hides the *path* — if the storage
-- bucket has a broad "any authenticated user" read policy (a common default),
-- a coach who already knows or guesses the path can still fetch the file
-- directly. That would make the documents_select restriction obscurity, not
-- access control.
--
-- IMPORTANT: run `select * from storage.policies where bucket_id = 'player-documents';`
-- (or check Supabase Dashboard → Storage → player-documents → Policies) BEFORE
-- running this, so you know what you're replacing. This script drops any
-- existing policy under these three names and recreates them — if your current
-- policies have different names, drop those manually too, or they'll stack
-- with (and potentially re-widen access alongside) the ones created here.
--
-- Delegates to the `documents` table as the single source of truth for who can
-- read/delete a given file, rather than re-deriving the rule from the storage
-- path — so this stays correct automatically if documents_select ever changes.

begin;

CREATE OR REPLACE FUNCTION user_can_access_document_path(doc_file_path text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM documents d
    WHERE d.file_path = doc_file_path
    AND (
      is_super_admin()
      OR d.player_id IN (SELECT user_guardian_player_ids())
      OR (d.doc_type <> 'medical_release' AND d.club_id IN (SELECT user_club_ids()))
      OR (
        d.doc_type = 'medical_release'
        AND (
          d.team_id IN (SELECT user_medical_admin_team_ids())
          OR d.club_id IN (SELECT user_medical_admin_club_ids())
        )
      )
    )
  )
$$;

GRANT EXECUTE ON FUNCTION user_can_access_document_path(text) TO authenticated;

drop policy if exists "player_documents_select" on storage.objects;
drop policy if exists "player_documents_insert" on storage.objects;
drop policy if exists "player_documents_delete" on storage.objects;

-- SELECT/DELETE: the documents row for this exact path must exist and be
-- visible to the caller. Works for delete because documentService.deleteDocument
-- removes the storage object BEFORE deleting the documents row, so the row is
-- still present (and still checkable) at delete time.
create policy "player_documents_select" on storage.objects for select to authenticated
  using (bucket_id = 'player-documents' and user_can_access_document_path(name));

create policy "player_documents_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'player-documents' and user_can_access_document_path(name));

-- INSERT: the documents row doesn't exist yet at upload time (storage upload
-- happens before the documents insert — see documentService.uploadDocument),
-- so this checks the path's club/player folder instead. Path shape is
-- `${clubId}/${playerId}/${timestamp}_${docType}.${ext}`. This intentionally
-- matches the PRE-tightening documents_insert breadth (any club staff, not
-- just medical admins) — the medical_release-specific restriction is enforced
-- when the accompanying documents row insert runs, immediately after.
create policy "player_documents_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'player-documents'
    and (
      is_super_admin()
      or (storage.foldername(name))[2]::uuid in (select user_guardian_player_ids())
      or (storage.foldername(name))[1]::uuid in (select user_club_ids())
    )
  );

commit;
