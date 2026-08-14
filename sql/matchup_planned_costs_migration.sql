-- ============================================================
-- Planned (estimated) match costs on the planner
--
-- The planner is where a season is shaped before any money moves:
-- opponents, weeks, home/away. The budget, meanwhile, is written in
-- the same weeks and has nothing to draw on but last season's
-- numbers. These two tables close that gap.
--
--   matchup_planned_costs   what a game is EXPECTED to cost, entered
--                           on the planner row while the schedule is
--                           still being negotiated.
--   budget_plan_contributions
--                           how much of those estimates is currently
--                           folded into the season budget, one row
--                           per (matchup, category, half). Without it
--                           a second "add to budget" would add the
--                           whole forecast again and every family
--                           would be billed twice for the same games.
--
-- Estimates are deliberately NOT transactions. An estimate that is
-- already in the budget can be sent to the ledger on demand, and it
-- lands there UNCLEARED — pending until the treasurer approves it by
-- hand. Uncleared rows are excluded from every balance and actuals
-- figure in the app, so nothing touches a family's money until that
-- approval happens.
--
-- Run this against an existing project. complete_schema.sql carries
-- the same tables for fresh installs.
-- ============================================================

CREATE TABLE IF NOT EXISTS matchup_planned_costs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matchup_id uuid NOT NULL REFERENCES matchups(id) ON DELETE CASCADE,
  -- Budget category code (OPE, TOU, LEA, …). Matches budget_items.category
  -- so an estimate lands on the same line its eventual spend will.
  category   text NOT NULL DEFAULT 'OPE',
  label      text,
  amount     numeric(10,2) NOT NULL DEFAULT 0,
  -- The pending ledger row this estimate was sent to, if any. One estimate maps
  -- to at most one draft transaction, which is what stops a second tap on "Add
  -- to Ledger" from filing the same cost twice. Nulled rather than cascaded if
  -- the treasurer deletes that row: the estimate then offers the action again.
  ledger_tx_id uuid REFERENCES transactions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- For projects that ran an earlier copy of this migration.
ALTER TABLE matchup_planned_costs
  ADD COLUMN IF NOT EXISTS ledger_tx_id uuid REFERENCES transactions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_matchup_planned_costs_matchup ON matchup_planned_costs(matchup_id);

CREATE OR REPLACE FUNCTION set_matchup_planned_costs_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS matchup_planned_costs_updated_at ON matchup_planned_costs;
CREATE TRIGGER matchup_planned_costs_updated_at
  BEFORE UPDATE ON matchup_planned_costs
  FOR EACH ROW EXECUTE FUNCTION set_matchup_planned_costs_updated_at();

-- ── RLS ──
-- Scoped through the parent matchup so the two can never disagree about
-- who may see a game's numbers.
ALTER TABLE matchup_planned_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "matchup_planned_costs_select" ON matchup_planned_costs;
CREATE POLICY "matchup_planned_costs_select" ON matchup_planned_costs FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR matchup_id IN (SELECT id FROM matchups WHERE team_id IN (SELECT user_team_ids()))
  );

DROP POLICY IF EXISTS "matchup_planned_costs_insert" ON matchup_planned_costs;
CREATE POLICY "matchup_planned_costs_insert" ON matchup_planned_costs FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin()
    OR matchup_id IN (SELECT id FROM matchups WHERE team_id IN (SELECT user_team_ids()))
  );

DROP POLICY IF EXISTS "matchup_planned_costs_update" ON matchup_planned_costs;
CREATE POLICY "matchup_planned_costs_update" ON matchup_planned_costs FOR UPDATE TO authenticated
  USING (
    is_super_admin()
    OR matchup_id IN (SELECT id FROM matchups WHERE team_id IN (SELECT user_team_ids()))
  );

DROP POLICY IF EXISTS "matchup_planned_costs_delete" ON matchup_planned_costs;
CREATE POLICY "matchup_planned_costs_delete" ON matchup_planned_costs FOR DELETE TO authenticated
  USING (
    is_super_admin()
    OR matchup_id IN (SELECT id FROM matchups WHERE team_id IN (SELECT user_team_ids()))
  );

-- ============================================================
-- What the planner has already put into the budget.
-- Mirrors budget_event_contributions, but keyed to a matchup rather
-- than a promoted event, because an estimate exists long before any
-- team_events row does.
-- ============================================================

CREATE TABLE IF NOT EXISTS budget_plan_contributions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_season_id uuid NOT NULL REFERENCES team_seasons(id) ON DELETE CASCADE,
  -- Nulled, NOT cascaded, when a matchup is deleted: the money that matchup put
  -- into the budget is still in there. An orphaned row is exactly the record the
  -- next push needs to back it out again; cascading would delete the evidence
  -- and strand the estimate in the budget forever.
  matchup_id     uuid REFERENCES matchups(id) ON DELETE SET NULL,
  category       text NOT NULL,
  half           text NOT NULL CHECK (half IN ('fall', 'spring')),
  -- Nulled rather than cascaded if the treasurer deletes the line by hand:
  -- the next push rebuilds it instead of failing on a dangling reference.
  budget_item_id uuid REFERENCES budget_items(id) ON DELETE SET NULL,
  -- The forecast this row COVERS. What the budget counts as already planned
  -- for, and what the "in budget" figures on both screens are summed from.
  applied_amount numeric(10,2) NOT NULL DEFAULT 0,
  -- What this row actually PUT ON the budget line, which is not the same
  -- number once the forecast is sharing a line the treasurer wrote themselves:
  -- under 'keep' it is zero, under 'difference' only the shortfall. Backing
  -- money out — a re-attach, a cancelled game, a shrinking estimate — has to
  -- use this, or it would strip the treasurer's own money off the line along
  -- with ours. Null on rows written before the modes existed; those were all
  -- 'full', where it equals applied_amount.
  line_amount    numeric(10,2),
  -- How the forecast rides on the line it is attached to, chosen by the
  -- treasurer per category and kept here because a re-push has to maintain the
  -- same arrangement rather than silently revert to adding the lot:
  --   full        the line keeps what was typed and carries the forecast too.
  --   difference  the line ends up equal to the forecast, with what was typed
  --               counting toward it.
  --   keep        the amount is left exactly as typed; only the link is
  --               recorded.
  attach_mode    text NOT NULL DEFAULT 'full'
                   CHECK (attach_mode IN ('full', 'difference', 'keep')),
  applied_at     timestamptz NOT NULL DEFAULT now(),
  applied_by     uuid REFERENCES auth.users(id),
  -- Set when the push had to be recorded as an amendment because the budget
  -- was already finalized.
  amendment_id   uuid REFERENCES budget_amendments(id) ON DELETE SET NULL,
  UNIQUE (team_season_id, matchup_id, category, half)
);

CREATE INDEX IF NOT EXISTS idx_budget_plan_contributions_ts
  ON budget_plan_contributions (team_season_id);

-- Added after the fact for projects that already ran this file. Existing rows
-- are left with a null line_amount on purpose: null reads as "this row put its
-- whole forecast on the line", which is exactly what every push before the
-- modes existed did, so nothing has to be backfilled or guessed at.
ALTER TABLE budget_plan_contributions ADD COLUMN IF NOT EXISTS line_amount numeric(10,2);
ALTER TABLE budget_plan_contributions ADD COLUMN IF NOT EXISTS attach_mode text NOT NULL DEFAULT 'full';

DO $$
BEGIN
  ALTER TABLE budget_plan_contributions
    ADD CONSTRAINT budget_plan_contributions_attach_mode_check
    CHECK (attach_mode IN ('full', 'difference', 'keep'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

ALTER TABLE budget_plan_contributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "budget_plan_contributions_select" ON budget_plan_contributions;
CREATE POLICY "budget_plan_contributions_select" ON budget_plan_contributions FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR team_season_id IN (SELECT id FROM team_seasons WHERE team_id IN (SELECT user_team_ids()))
  );

DROP POLICY IF EXISTS "budget_plan_contributions_insert" ON budget_plan_contributions;
CREATE POLICY "budget_plan_contributions_insert" ON budget_plan_contributions FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin()
    OR team_season_id IN (SELECT id FROM team_seasons WHERE team_id IN (SELECT user_team_ids()))
  );

DROP POLICY IF EXISTS "budget_plan_contributions_update" ON budget_plan_contributions;
CREATE POLICY "budget_plan_contributions_update" ON budget_plan_contributions FOR UPDATE TO authenticated
  USING (
    is_super_admin()
    OR team_season_id IN (SELECT id FROM team_seasons WHERE team_id IN (SELECT user_team_ids()))
  );

DROP POLICY IF EXISTS "budget_plan_contributions_delete" ON budget_plan_contributions;
CREATE POLICY "budget_plan_contributions_delete" ON budget_plan_contributions FOR DELETE TO authenticated
  USING (
    is_super_admin()
    OR team_season_id IN (SELECT id FROM team_seasons WHERE team_id IN (SELECT user_team_ids()))
  );
