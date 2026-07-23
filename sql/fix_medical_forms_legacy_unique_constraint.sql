-- Fixes: "duplicate key value violates unique constraint medical_forms_player_id_key"
-- on medical release Sign & Submit for a player's second season.
--
-- Root cause: season_compliance_migration.sql re-keyed medical_forms to a
-- composite (player_id, season_id) primary key, but it dropped the old
-- constraint by the name it *should* have had (medical_forms_pkey). On the
-- live table the legacy single-column constraint was actually named
-- medical_forms_player_id_key (Postgres's default name for a UNIQUE, not a
-- PRIMARY KEY, constraint), so the DROP silently no-op'd and the old
-- one-row-per-player-ever constraint survived alongside the new per-season
-- design. Any second season's upsert then collides with it.
--
-- Before running, confirm what's actually on the table:
--   select conname, contype, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conrelid = 'medical_forms'::regclass;

begin;

-- 1. Drop the legacy single-column uniqueness, whatever it's actually named.
alter table medical_forms drop constraint if exists medical_forms_player_id_key;
alter table medical_forms drop constraint if exists medical_forms_pkey;

-- 2. Guarantee the composite per-season key exists (idempotent: only adds it
--    if some prior run of season_compliance_migration.sql didn't already).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'medical_forms'::regclass and contype = 'p'
  ) then
    alter table medical_forms add primary key (player_id, season_id);
  end if;
end $$;

commit;
