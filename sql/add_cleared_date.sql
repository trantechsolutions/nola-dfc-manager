-- Add cleared_date to transactions: the date funds actually cleared the bank/institution.
-- Distinct from `date` (posted/transaction date) which records when the transaction occurred.
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS cleared_date date;
