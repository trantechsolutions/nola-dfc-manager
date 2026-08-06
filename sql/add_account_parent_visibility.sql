-- Migration: per-account "visible to parents" flag + the guardian read path
-- that makes it mean anything. Run this in the Supabase SQL editor.
--
-- Two problems, one fix, because they are the same problem from either side:
--
-- 1. Parents never saw the "How to Pay" panel on My Player at all. ParentView
--    builds it from the team's accounts (name + handle, e.g. Venmo/@TeamVenmo)
--    with team.payment_info as the text fallback -- but accounts_select only
--    granted access via user_team_ids(), which is derived from user_roles, and
--    a guardian-only login has zero user_roles rows. Every parent's accounts
--    query came back empty. Sibling tables (teams, team_seasons, team_events,
--    matchups) already carry a guardian carve-out; accounts was missed. See
--    sql/fix_teams_select_guardian_rls.sql for the same fix on teams.
--
-- 2. Handing parents the whole accounts list is the wrong fix -- most rows are
--    internal ledger buckets (Chase Checking, Uncategorized, Cash) that no
--    parent should see, let alone try to pay into. So the carve-out is scoped
--    to accounts explicitly published for that purpose.
--
-- Backfill preserves today's behavior exactly: PaymentOptions already renders
-- only accounts carrying a handle, so those -- and only those -- start public.
-- New accounts default to private; publishing is a deliberate act.

-- ── 1. the flag ──
alter table accounts add column if not exists is_public boolean not null default false;

comment on column accounts.is_public is
  'Shown to guardians in ParentView''s "How to Pay" panel. False = internal ledger account.';

-- ── 2. backfill: anything already surfacing to parents stays surfaced ──
update accounts
set is_public = true
where handle is not null
  and trim(handle) <> ''
  and is_active
  and not is_public;

-- ── 3. guardian read path, scoped to published accounts ──
-- SELECT only. Insert/update/delete stay role-gated: a parent reads a payment
-- handle, never edits one.
DROP POLICY IF EXISTS "accounts_select" ON accounts;

CREATE POLICY "accounts_select" ON accounts FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR team_id IN (SELECT user_team_ids())
    OR (
      is_public
      AND is_active
      AND team_id IN (SELECT team_id FROM players WHERE id IN (SELECT user_guardian_player_ids()))
    )
  );
