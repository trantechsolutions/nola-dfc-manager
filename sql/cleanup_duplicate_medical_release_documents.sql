-- One-off cleanup for duplicate medical_release rows in `documents` that
-- piled up because of the RLS gap fixed in
-- fix_documents_delete_rls_guardian_scope.sql (parent re-signs of the
-- Medical Release form couldn't actually delete the prior document, so each
-- re-sign added a new row instead of replacing it).
--
-- Keeps the newest medical_release document per (player_id, season_id) and
-- deletes the older duplicates. Does not touch other doc_types, since only
-- medical_release uses the delete-then-reupload "overwrite" pattern.
--
-- Note: this only removes the database rows. The underlying files in the
-- `player-documents` storage bucket for the deleted rows are left in place
-- (orphaned) — harmless, but you can clear them separately from the
-- Storage UI if desired.
--
-- Preview what will be deleted before running the DELETE below:
--   select id, player_id, season_id, title, created_at
--   from documents
--   where doc_type = 'medical_release'
--   and id not in (
--     select distinct on (player_id, season_id) id
--     from documents
--     where doc_type = 'medical_release'
--     order by player_id, season_id, created_at desc
--   )
--   order by player_id, season_id, created_at desc;

begin;

delete from documents
where doc_type = 'medical_release'
and id not in (
  select distinct on (player_id, season_id) id
  from documents
  where doc_type = 'medical_release'
  order by player_id, season_id, created_at desc
);

commit;
