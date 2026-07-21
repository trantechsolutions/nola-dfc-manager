-- Add per-transaction reconciliation flag.
-- reconciled=true means this item has been matched against the bank statement.
-- Distinct from cleared (funds received) — this is the bookkeeper's confirmation
-- that the item appears on the bank/institution statement and the books balance.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS reconciled boolean DEFAULT false;
