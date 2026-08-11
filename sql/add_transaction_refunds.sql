-- Refund support: a refund is its own transaction row that reverses another
-- one, linked back to it. Keeping it a real row means every balance, book
-- balance, player-financial trigger and export nets out on its own — nothing
-- downstream has to learn what a refund is.
--
-- Deliberately NOT reusing original_tx_id: that column belongs to the waterfall
-- distribution engine, and overloading it would make deleteBatch('originalTxId')
-- sweep up refunds along with distribution rows.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS refund_of_tx_id uuid REFERENCES transactions(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS transactions_refund_of_tx_id_idx ON transactions(refund_of_tx_id);

COMMENT ON COLUMN transactions.refund_of_tx_id IS
  'When set, this row reverses the referenced transaction (full or partial). Amount carries the opposite sign of the original.';
