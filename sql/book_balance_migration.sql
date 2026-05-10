-- Migration: Add account_balances table for monthly book reconciliation
-- Run this in the Supabase SQL editor.
--
-- Purpose: Allows team managers to record a stated (real-world) balance
-- for each account at the end of each month and compare it against the
-- ledger balance computed from transactions. Once a month is locked, its
-- snapshot is frozen for auditing.

-- ── 1. account_balances table ──
CREATE TABLE IF NOT EXISTS account_balances (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id        uuid        NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  team_id           uuid        NOT NULL REFERENCES teams(id)    ON DELETE CASCADE,
  -- Stored as the first day of the month (YYYY-MM-01) for simple equality lookups
  month_end_date    date        NOT NULL,
  -- What the manager physically counted / saw on the statement
  stated_balance    numeric(10,2) NOT NULL DEFAULT 0,
  -- Snapshot of the ledger running total at lock time (NULL until locked)
  ledger_balance    numeric(10,2),
  -- stated_balance - ledger_balance (NULL until locked)
  delta             numeric(10,2),
  -- Once locked the row becomes read-only to non-super-admins
  is_locked         boolean     NOT NULL DEFAULT false,
  notes             text,
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, month_end_date)
);

-- ── 2. Indexes ──
CREATE INDEX IF NOT EXISTS account_balances_team_month_idx
  ON account_balances (team_id, month_end_date DESC);

CREATE INDEX IF NOT EXISTS account_balances_account_id_idx
  ON account_balances (account_id);

-- ── 3. updated_at trigger ──
CREATE OR REPLACE FUNCTION set_account_balances_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS account_balances_updated_at ON account_balances;
CREATE TRIGGER account_balances_updated_at
  BEFORE UPDATE ON account_balances
  FOR EACH ROW EXECUTE FUNCTION set_account_balances_updated_at();

-- ── 4. Row-Level Security ──
ALTER TABLE account_balances ENABLE ROW LEVEL SECURITY;

-- SELECT: super-admin OR user has a role on the team
CREATE POLICY "account_balances_select" ON account_balances
  FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR team_id IN (SELECT user_team_ids())
  );

-- INSERT: super-admin OR user has a role on the team
CREATE POLICY "account_balances_insert" ON account_balances
  FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin()
    OR team_id IN (SELECT user_team_ids())
  );

-- UPDATE: super-admin always; team members only when NOT locked
CREATE POLICY "account_balances_update" ON account_balances
  FOR UPDATE TO authenticated
  USING (
    is_super_admin()
    OR (
      team_id IN (SELECT user_team_ids())
      AND is_locked = false
    )
  );

-- DELETE: super-admin only (locked records must not be casually deleted)
CREATE POLICY "account_balances_delete" ON account_balances
  FOR DELETE TO authenticated
  USING (is_super_admin());

-- ── 5. Reconciliation helper view (optional, for debugging) ──
-- Shows the current ledger total per account per month alongside any
-- stored stated_balance. Not required by the app but useful in the SQL editor.
CREATE OR REPLACE VIEW v_account_reconciliation AS
SELECT
  ab.team_id,
  ab.account_id,
  a.name           AS account_name,
  a.holding,
  ab.month_end_date,
  ab.stated_balance,
  ab.ledger_balance AS locked_ledger_balance,
  ab.delta          AS locked_delta,
  ab.is_locked,
  ab.notes,
  ab.updated_at
FROM account_balances ab
JOIN accounts a ON a.id = ab.account_id
ORDER BY ab.team_id, ab.month_end_date DESC, a.sort_order;
