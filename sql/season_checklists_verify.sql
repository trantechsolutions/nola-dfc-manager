-- Verify that sql/season_checklists_migration.sql landed completely.
--
-- Read-only: creates, alters, and drops nothing. Run it in the Supabase SQL
-- editor and read the `status` column — every row should say OK.
--
-- Why this exists: the migration has been edited since it was first run, but
-- only its COMMENTS changed (the `linkedForm` item field lives inside the
-- `items` jsonb column and needs no DDL). This script proves that rather than
-- asking you to take it on faith.
--
-- If any row reports MISSING, see the note at the bottom before re-running the
-- migration — most of it is idempotent, but CREATE POLICY is not.

with expected(kind, name, detail) as (
  values
    ('table',    'season_checklists',                          null),
    ('table',    'checklist_responses',                        null),

    ('column',   'season_checklists',                          'items'),
    ('column',   'season_checklists',                          'is_published'),
    ('column',   'season_checklists',                          'title'),
    ('column',   'checklist_responses',                        'completed'),
    ('column',   'checklist_responses',                        'value'),
    ('column',   'checklist_responses',                        'document_id'),
    ('column',   'checklist_responses',                        'verified'),

    ('index',    'checklist_responses_checklist_idx',          null),
    ('index',    'checklist_responses_player_idx',             null),

    ('function', 'set_checklist_updated_at',                   null),
    ('function', 'user_checklist_admin_team_ids',              null),
    ('function', 'guard_checklist_verification',               null),

    ('trigger',  'season_checklists_updated_at',               'season_checklists'),
    ('trigger',  'checklist_responses_updated_at',             'checklist_responses'),
    ('trigger',  'checklist_responses_guard_verification',     'checklist_responses'),

    ('policy',   'season_checklists_select',                   'season_checklists'),
    ('policy',   'season_checklists_insert',                   'season_checklists'),
    ('policy',   'season_checklists_update',                   'season_checklists'),
    ('policy',   'season_checklists_delete',                   'season_checklists'),
    ('policy',   'checklist_responses_select',                 'checklist_responses'),
    ('policy',   'checklist_responses_insert',                 'checklist_responses'),
    ('policy',   'checklist_responses_update',                 'checklist_responses'),
    ('policy',   'checklist_responses_delete',                 'checklist_responses'),

    ('rls',      'season_checklists',                          null),
    ('rls',      'checklist_responses',                        null),

    ('realtime', 'season_checklists',                          null),
    ('realtime', 'checklist_responses',                        null),

    ('identity', 'season_checklists',                          null),
    ('identity', 'checklist_responses',                        null)
)
select
  e.kind,
  e.name,
  coalesce(e.detail, '') as on_table,
  case when
    case e.kind
      when 'table' then exists (
        select 1 from pg_tables where schemaname = 'public' and tablename = e.name)
      when 'column' then exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = e.name and column_name = e.detail)
      when 'index' then exists (
        select 1 from pg_indexes where schemaname = 'public' and indexname = e.name)
      when 'function' then exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = e.name)
      when 'trigger' then exists (
        select 1 from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
        where c.relname = e.detail and tg.tgname = e.name and not tg.tgisinternal)
      when 'policy' then exists (
        select 1 from pg_policies
        where schemaname = 'public' and tablename = e.detail and policyname = e.name)
      when 'rls' then exists (
        select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = e.name and c.relrowsecurity)
      when 'realtime' then exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = e.name)
      -- REPLICA IDENTITY FULL is 'f'; without it a filtered realtime
      -- subscription never sees deletes (see sql/enable_realtime.sql).
      when 'identity' then exists (
        select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = e.name and c.relreplident = 'f')
    end
  then 'OK' else 'MISSING' end as status
from expected e
order by
  case when
    case e.kind
      when 'table' then exists (select 1 from pg_tables where schemaname='public' and tablename=e.name)
      else true
    end
  then 1 else 0 end,
  e.kind, e.name;

-- ── If something reports MISSING ──
--
-- Tables/columns/indexes/functions/triggers: safe to re-run the whole migration.
-- Those statements all use `if not exists`, `create or replace`, or
-- `drop trigger if exists` first.
--
-- Policies: CREATE POLICY has no `if not exists`, so re-running the migration
-- errors on the first policy that already exists. Drop just the missing one's
-- name first, then re-run:
--
--   drop policy if exists "<policy_name>" on <table_name>;
--
-- Realtime / identity: re-running section 8 alone is safe and idempotent.
