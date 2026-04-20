-- Phase 4: Drop legacy free-text columns from transactions
-- Safe to run after accounts_migration.sql has been applied and verified.
-- All data is now captured in account_id, transfer_from_account_id, transfer_to_account_id.

ALTER TABLE transactions
  DROP COLUMN IF EXISTS type,
  DROP COLUMN IF EXISTS transfer_from,
  DROP COLUMN IF EXISTS transfer_to;
