-- Fixes: parents see "No calendar feed has been configured for this team
-- yet." on the Schedule tab even when the team's ICS feed IS configured,
-- and see 0 upcoming / 0 past events regardless of the actual schedule.
--
-- Root cause: RLS, not missing data. App.jsx fetches the parent's team
-- directly via teamService.getTeam(parentTeamId) because useTeamContext's
-- `teams` array is always empty for guardian-only accounts (they have zero
-- user_roles rows -- see the comment at App.jsx's parentTeam effect). But
-- teams_select only granted access via user_club_ids(), which is derived
-- from user_roles -- so a pure guardian has no path to read the teams row
-- at all. getTeam() throws (0 rows from .single()), effectiveTeam stays
-- null, and everything downstream (icalUrl, events, matchups) reads as
-- empty. Sibling tables (team_seasons, team_events, matchups) already carry
-- a guardian carve-out for exactly this reason; teams was missed.
--
-- Fix: add the same guardian carve-out used elsewhere in rls_policies.sql --
-- a parent can read the teams row for their own child's team.

DROP POLICY IF EXISTS "teams_select" ON teams;

CREATE POLICY "teams_select" ON teams FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR club_id IN (SELECT user_club_ids())
    OR id IN (SELECT team_id FROM players WHERE id IN (SELECT user_guardian_player_ids()))
  );
