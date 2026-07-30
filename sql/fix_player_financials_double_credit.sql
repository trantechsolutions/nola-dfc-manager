-- Migration: stop double-crediting players for sponsor/fundraiser deposits.
--
-- PROBLEM
-- player_financials credited a player for any cleared SPO/FUN row matching
--   (t.distributed OR t.waterfall_batch_id IS NOT NULL)
-- A source deposit linked to a player satisfies the first branch as soon as it is
-- distributed, and the per-player credit row the distribution engine writes
-- satisfies the second. A $300 car wash logged against Ana that distributes $175
-- to her therefore credited her $475. The error was invisible in the UI because
-- remaining_balance is clamped with GREATEST(0, ...).
--
-- FIX
-- Count only the distributed child rows (waterfall_batch_id IS NOT NULL). Those
-- rows are the record of who actually earned what. `distributed` stays a flag on
-- the source deposit meaning "already split" — it no longer grants credit by
-- itself. Nothing else sets that flag: the distribution engine is the only writer
-- (useFinance.handleWaterfallCredit), bulk import always inserts distributed=false,
-- and the transaction modal does not expose the field.
--
-- The remaining_balance floor means balances can only move DOWN (toward the true
-- amount owed) after this runs — no player's balance can jump above their fee.
--
-- Run this in the Supabase SQL editor. Safe to re-run.

CREATE OR REPLACE VIEW player_financials AS
SELECT
  ps.player_id,
  ps.season_id,
  ps.team_season_id,
  ps.fee_waived,
  CASE
    WHEN ps.fee_waived THEN 0
    ELSE COALESCE(
      ceil((
        (ts.total_projected_expenses * (1 + ts.buffer_percent / 100.0))
        / NULLIF(ts.expected_roster_size, 0)
      ) / 50) * 50, 0)
  END AS base_fee,
  COALESCE(sum(t.amount) FILTER (WHERE t.category = 'TMF' AND t.cleared), 0) AS total_paid,
  COALESCE(sum(t.amount) FILTER (WHERE t.category = 'FUN' AND t.cleared AND t.waterfall_batch_id IS NOT NULL), 0) AS fundraising,
  COALESCE(sum(t.amount) FILTER (WHERE t.category = 'SPO' AND t.cleared AND t.waterfall_batch_id IS NOT NULL), 0) AS sponsorships,
  COALESCE(sum(t.amount) FILTER (WHERE t.category = 'CRE' AND t.cleared), 0) AS credits,
  GREATEST(0,
    CASE WHEN ps.fee_waived THEN 0
    ELSE COALESCE(
      ceil((
        (ts.total_projected_expenses * (1 + ts.buffer_percent / 100.0))
        / NULLIF(ts.expected_roster_size, 0)
      ) / 50) * 50, 0)
    END
    - COALESCE(sum(t.amount) FILTER (WHERE t.category = 'TMF' AND t.cleared), 0)
    - COALESCE(sum(t.amount) FILTER (WHERE t.category = 'FUN' AND t.cleared AND t.waterfall_batch_id IS NOT NULL), 0)
    - COALESCE(sum(t.amount) FILTER (WHERE t.category = 'SPO' AND t.cleared AND t.waterfall_batch_id IS NOT NULL), 0)
    - COALESCE(sum(t.amount) FILTER (WHERE t.category = 'CRE' AND t.cleared), 0)
  ) AS remaining_balance
FROM player_seasons ps
LEFT JOIN team_seasons ts ON ts.id = ps.team_season_id
LEFT JOIN transactions t ON t.player_id = ps.player_id AND t.season_id = ps.season_id
GROUP BY ps.player_id, ps.season_id, ps.team_season_id, ps.fee_waived,
         ts.total_projected_expenses, ts.buffer_percent, ts.expected_roster_size;

-- Audit helper: source deposits that were credited to a player under the old rule.
-- Every row here had its amount counted twice; re-check these balances after running.
--
-- SELECT t.player_id, t.season_id, t.category, t.title, t.amount, t.date
-- FROM transactions t
-- WHERE t.player_id IS NOT NULL
--   AND t.cleared
--   AND t.distributed
--   AND t.waterfall_batch_id IS NULL
--   AND t.category IN ('SPO', 'FUN')
-- ORDER BY t.date DESC;
