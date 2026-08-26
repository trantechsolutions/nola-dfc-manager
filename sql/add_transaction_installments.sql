-- Payment plans: one ledger item paid off in pieces.
--
-- The item itself carries the full amount and stays PENDING — it is what is
-- owed, not money in hand. Each payment against it is its own real transaction
-- row linked back here, so every aggregate that already counts cleared rows
-- only (book balance, the player_financials view, statement reconciliation)
-- picks the money up in the month it actually arrived without learning what a
-- payment plan is.
--
-- It follows that a plan's parent row must never be marked cleared: that would
-- count the whole obligation a second time, on top of the payments.
--
-- Deliberately a separate column from refund_of_tx_id and original_tx_id. A
-- payment carries the SAME sign as what it pays off, a refund carries the
-- opposite, and original_tx_id belongs to the waterfall distribution engine —
-- sharing any of them would make one feature's cleanup sweep up another's rows.
--
-- SET NULL rather than CASCADE, unlike refunds: a refund is derived from what it
-- reverses and is meaningless without it, but a payment is money that genuinely
-- arrived. Deleting the obligation must never delete the cash — the payments
-- simply stop being grouped and stand on their own in the ledger.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS installment_of_tx_id uuid REFERENCES transactions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS transactions_installment_of_tx_id_idx ON transactions(installment_of_tx_id);

COMMENT ON COLUMN transactions.installment_of_tx_id IS
  'When set, this row is a partial payment towards the referenced transaction. Same sign as what it pays off; the referenced row is the full amount owed and is never cleared. Nulled rather than cascaded on delete so real payments survive their obligation.';
