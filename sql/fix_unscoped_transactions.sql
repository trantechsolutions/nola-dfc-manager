-- Companion to the client fix for
--   "new row violates row-level security policy for table \"transactions\""
-- which non-super-admin staff hit when logging a transaction in a season
-- their team had no team_seasons row for (see useLedgerManager /
-- teamService.ensureTeamSeason).
--
-- The same column drives reads:
--   transactions_select ... team_season_id IN (SELECT id FROM team_seasons
--                                              WHERE team_id IN user_team_ids())
-- so any transaction already stored with team_season_id = NULL is visible
-- ONLY to super admins. Everyone else silently sees a shorter ledger and
-- different totals. This script backfills those rows.
--
-- Run the diagnostics (1, 4) and review before running the UPDATEs.

-- 1. Diagnostic: unscoped transactions by season.
select season_id, count(*) as unscoped, min(date) as earliest, max(date) as latest
from transactions
where team_season_id is null
group by season_id
order by season_id desc;

begin;

-- 2. Player-linked rows resolve unambiguously through the player's team.
update transactions tx
set team_season_id = ts.id
from players p
join team_seasons ts on ts.team_id = p.team_id
where tx.team_season_id is null
  and tx.player_id = p.id
  and ts.season_id = tx.season_id;

-- 3. General team income/expense has no player to route through. Assign it
--    only where the season has exactly one team_season, so there is no
--    question which team the money belonged to. Multi-team seasons are left
--    alone and reported in step 4.
update transactions tx
set team_season_id = sole.id
from (
  select season_id, min(id) as id
  from team_seasons
  group by season_id
  having count(*) = 1
) sole
where tx.team_season_id is null
  and tx.season_id = sole.season_id;

commit;

-- 4. Diagnostic: anything still unscoped needs a human to pick the team
--    (multi-team season, or a season with no team_seasons rows at all).
select tx.id, tx.season_id, tx.date, tx.title, tx.amount, tx.player_id,
       (select count(*) from team_seasons ts where ts.season_id = tx.season_id) as candidate_team_seasons
from transactions tx
where tx.team_season_id is null
order by tx.season_id desc, tx.date;
