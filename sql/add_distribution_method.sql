-- Migration: per-team fundraising distribution method.
-- Each team_season chooses how sponsor/fundraiser credits are applied:
--   'waterfall'  – linked player first, overflow splits to teammates, rest to team pot (default)
--   'direct'     – linked player only; anything over their balance goes to the team pot
--   'even_split' – ignore the linked player; split equally across all buy-in players
--   'team_pot'   – everything goes straight to the team pot, no player credit
-- Existing rows backfill to 'waterfall' so current behavior is preserved.
-- Run this in the Supabase SQL editor.

alter table team_seasons
  add column if not exists distribution_method text not null default 'waterfall';
