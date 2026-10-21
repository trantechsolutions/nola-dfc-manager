-- Migration: a team's active season.
-- The team manager picks which season the team is "in". Parents open on it, and staff open on it too, but
-- staff can still switch to a future season in the sidebar to budget ahead without moving everyone else.
-- Null means the old behaviour: the club's default season for staff, the date (July to June) for everyone.
-- teams_update (rls_policies.sql) already covers the column; the app limits the setting to team managers
-- and club admins (PERMISSIONS.TEAM_SET_ACTIVE_SEASON).
-- Run this in the Supabase SQL editor. Safe to run again.

alter table teams
  add column if not exists active_season_id text references seasons(id) on delete set null;
