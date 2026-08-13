-- ============================================================
-- Per-matchup season half
--
-- Which half of the season a game's cost lands in has always been
-- derived from its date: July..December is fall, January..June is
-- spring (utils/eventBudgetPush.getSeasonHalf). That works once a
-- game is scheduled, but the planner exists precisely for the weeks
-- BEFORE it is -- an undated matchup fell to fall by default, which
-- quietly loaded the whole forecast onto the fall side of the budget
-- even when half the season was known to be spring games.
--
-- season_half lets the manager say so outright. NULL keeps the old
-- behaviour (derive from the date), so nothing that exists changes.
--
-- Moving a matchup between halves is safe: the planner push keys its
-- contributions on (matchup, category, half), so the old half's row
-- is backed out of the budget in the same push that adds the new
-- one. See utils/plannedCostBudget.
-- ============================================================

ALTER TABLE matchups
  ADD COLUMN IF NOT EXISTS season_half text
  CHECK (season_half IN ('fall', 'spring'));

COMMENT ON COLUMN matchups.season_half IS
  'Explicit fall/spring for budgeting. NULL derives it from match_date.';
