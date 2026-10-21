-- One-off cleanup: duplicate team_events created by the 2026-10-21 feed change.
-- Run in the Supabase SQL editor.
--
-- Switching a team's iCal URL re-synced the same games under the new
-- provider's UIDs, so a game can now have two rows at the same start time: the
-- original row and the one inserted today. The original (oldest) row is kept
-- and today's copies are removed. Sync now matches feed events to an existing
-- row at the same start time, so the next sync updates the original instead of
-- re-inserting the copy.
--
-- Nothing attached to a removed copy is lost: an admin-locked event type, ledger
-- entries, matchup promotions and budget-push records are moved onto the kept
-- row first. A copy whose budget record can't move (the kept row already has
-- one for the same season/category/half) is left in place and listed at the end.
--
-- Step 1 (preview) is read-only. Steps 2–7 run in one transaction.

-- ── 1. PREVIEW — run alone first and check the list ──
WITH dup AS (
  SELECT e.*,
         count(*) OVER (PARTITION BY team_id, event_date) AS n,
         bool_or((created_at AT TIME ZONE 'America/Chicago')::date = DATE '2026-10-21')
           OVER (PARTITION BY team_id, event_date) AS has_today,
         row_number() OVER (PARTITION BY team_id, event_date ORDER BY created_at ASC, id) AS rn
  FROM team_events e
)
SELECT t.name AS team, d.event_date, d.title, d.uid, d.created_at,
       CASE WHEN d.rn = 1 THEN 'KEEP' ELSE 'delete' END AS action
FROM dup d JOIN teams t ON t.id = d.team_id
WHERE d.n > 1 AND d.has_today
ORDER BY t.name, d.event_date, d.rn;

-- ── 2–7. CLEANUP ──
BEGIN;

CREATE TEMP TABLE dedupe_map ON COMMIT DROP AS
WITH dup AS (
  SELECT id, team_id, event_date,
         count(*) OVER (PARTITION BY team_id, event_date) AS n,
         bool_or((created_at AT TIME ZONE 'America/Chicago')::date = DATE '2026-10-21')
           OVER (PARTITION BY team_id, event_date) AS has_today,
         row_number() OVER (PARTITION BY team_id, event_date ORDER BY created_at ASC, id) AS rn,
         first_value(id) OVER (PARTITION BY team_id, event_date ORDER BY created_at ASC, id) AS keeper_id
  FROM team_events
)
SELECT id AS loser_id, keeper_id FROM dup WHERE n > 1 AND has_today AND rn > 1;

-- 2. Carry an admin-locked type over to the kept row
UPDATE team_events k
SET event_type = l.event_type, type_locked = true, updated_at = now()
FROM dedupe_map m JOIN team_events l ON l.id = m.loser_id
WHERE k.id = m.keeper_id AND l.type_locked AND NOT coalesce(k.type_locked, false);

-- 3. Ledger entries
UPDATE transactions tx SET event_id = m.keeper_id
FROM dedupe_map m WHERE tx.event_id = m.loser_id;

-- 4. Matchups promoted to an event
UPDATE matchups mu SET promoted_event_id = m.keeper_id
FROM dedupe_map m WHERE mu.promoted_event_id = m.loser_id;

-- 5. Budget-push records (skipped where the kept row already has the same slot)
UPDATE budget_event_contributions c SET event_id = m.keeper_id
FROM dedupe_map m
WHERE c.event_id = m.loser_id
  AND NOT EXISTS (
    SELECT 1 FROM budget_event_contributions k
    WHERE k.event_id = m.keeper_id
      AND k.team_season_id = c.team_season_id AND k.category = c.category AND k.half = c.half
  );

-- 6. Delete the newer copies that no longer carry anything
DELETE FROM team_events e
USING dedupe_map m
WHERE e.id = m.loser_id
  AND NOT EXISTS (SELECT 1 FROM budget_event_contributions c WHERE c.event_id = e.id);

-- 7. Anything left behind for a manual look (expected: no rows)
SELECT e.id, e.title, e.event_date
FROM team_events e JOIN dedupe_map m ON m.loser_id = e.id;

COMMIT;
