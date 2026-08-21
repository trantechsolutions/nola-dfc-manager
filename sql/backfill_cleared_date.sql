-- Backfill transactions.cleared_date and make it the reconciliation date.
--
-- Two dates live on a transaction and they are not the same thing:
--   date         — the EVENT date: what the money is for. A tournament
--                  registration paid in August for a November cup is dated
--                  November, because that is where it belongs in the season.
--   cleared_date — the ACTIVITY date: when the money actually left or landed.
--                  This is the only date a bank statement ever shows.
--
-- Book balance and statement matching were reading `date`, so anything paid
-- up-front for a future event fell outside the month it reconciled in and the
-- app's total drifted above the bank's by exactly those amounts.

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS cleared_date date;

COMMENT ON COLUMN transactions.date IS
  'Event date — when the thing this money paid for happens. Drives ledger ordering and season reporting.';
COMMENT ON COLUMN transactions.cleared_date IS
  'Activity date — when the funds actually moved. Drives book balance and statement reconciliation.';

-- Backfill: for a row already dated in the past, the event date is also the day
-- the money moved. For a row dated in the future, it cannot be — the best
-- available stand-in is when the row was entered.
UPDATE transactions
SET cleared_date = LEAST(date, created_at::date)
WHERE cleared IS TRUE
  AND cleared_date IS NULL;

-- Uncleared rows have no activity date by definition.
UPDATE transactions
SET cleared_date = NULL
WHERE cleared IS NOT TRUE
  AND cleared_date IS NOT NULL;

-- Reconciliation windows scan by cleared_date.
CREATE INDEX IF NOT EXISTS idx_transactions_cleared_date
  ON transactions (cleared_date)
  WHERE cleared IS TRUE;
