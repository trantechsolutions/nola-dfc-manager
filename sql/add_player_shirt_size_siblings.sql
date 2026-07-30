-- Adds shirt size and sibling count to players, for gear-order and
-- carpool/family planning. Both optional — no default roster data has these.
--
-- Run this against an existing project. complete_schema.sql has been
-- updated to include these columns for fresh installs.

alter table players
  add column if not exists shirt_size text,
  add column if not exists siblings_count smallint check (siblings_count is null or siblings_count >= 0);
