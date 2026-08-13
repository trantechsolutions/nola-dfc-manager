-- Fixes: "Amendment failed: new row violates row-level security policy for
-- table budget_amendments" on the Budget screen, even though the budget
-- change itself is saved.
--
-- Root cause: budget_amendments has RLS enabled but ZERO policies on it, so
-- Postgres denies every insert (and returns no rows on select). The table's
-- only policies were the permissive ones created in
-- budget_amendments_migration.sql; rls_policies.sql opens by dropping every
-- policy in the public schema and then never recreates any for
-- budget_amendments -- the table was added after that file was written and
-- was never folded into it.
--
-- Why the change still lands: BudgetView's handleSaveAmendment writes the
-- budget items and the team_seasons totals first and records the amendment
-- last, so the budget is already committed by the time the insert is
-- rejected. The amendment history row is what goes missing.
--
-- Fix: scope budget_amendments the same way budget_items is scoped -- via the
-- team_season's team. Append-only: no update or delete policy, so a recorded
-- amendment stays on the record.

DROP POLICY IF EXISTS "authenticated read amendments" ON budget_amendments;
DROP POLICY IF EXISTS "authenticated insert amendments" ON budget_amendments;
DROP POLICY IF EXISTS "budget_amendments_select" ON budget_amendments;
DROP POLICY IF EXISTS "budget_amendments_insert" ON budget_amendments;

CREATE POLICY "budget_amendments_select" ON budget_amendments FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR team_season_id IN (SELECT id FROM team_seasons WHERE team_id IN (SELECT user_team_ids()))
  );

CREATE POLICY "budget_amendments_insert" ON budget_amendments FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin()
    OR team_season_id IN (SELECT id FROM team_seasons WHERE team_id IN (SELECT user_team_ids()))
  );
