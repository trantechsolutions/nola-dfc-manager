-- ============================================================
-- Matchup Scheduling (inter-team match negotiation)
--
-- Replaces the manual "who are we playing this week" spreadsheet
-- with a structured planning entity. A matchup tracks the
-- negotiation lifecycle of a single game against an outside team
-- (status, opponent, home/away, league match ID, location/field,
-- notes, deadline). Confirming a matchup is the one moment it
-- promotes into team_events, so the negotiation history and the
-- real schedule never disagree about whether a game is on.
--
-- Run this against an existing project. complete_schema.sql has
-- been updated to include this table for fresh installs.
-- ============================================================

CREATE TABLE IF NOT EXISTS matchups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id),
  season_id text NOT NULL REFERENCES seasons(id),
  week_label text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'tentative', 'confirmed', 'dns', 'cancelled')),
  source text NOT NULL DEFAULT 'league_assigned' CHECK (source IN ('league_assigned', 'self_scheduled')),
  is_home boolean,
  opponent_name text,
  league_match_id text,
  match_date date,
  match_time time,
  location text,
  field text,
  deadline_date date,
  notes text,
  promoted_event_id uuid REFERENCES team_events(id) ON DELETE SET NULL,
  reschedule_of_id uuid REFERENCES matchups(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_matchups_team_season ON matchups(team_id, season_id);
CREATE INDEX IF NOT EXISTS idx_matchups_reschedule_of ON matchups(reschedule_of_id);

CREATE OR REPLACE FUNCTION set_matchups_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS matchups_updated_at ON matchups;
CREATE TRIGGER matchups_updated_at
  BEFORE UPDATE ON matchups
  FOR EACH ROW EXECUTE FUNCTION set_matchups_updated_at();

-- ── RLS ──
-- Mirrors team_events: staff scoped to their team can read/write; parents
-- (guardians of a player on the team) can read, same as they can read
-- team_events today.
ALTER TABLE matchups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "matchups_select" ON matchups FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR team_id IN (SELECT user_team_ids())
    OR team_id IN (SELECT team_id FROM players WHERE id IN (SELECT user_guardian_player_ids()))
  );

CREATE POLICY "matchups_insert" ON matchups FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR team_id IN (SELECT user_team_ids()));

CREATE POLICY "matchups_update" ON matchups FOR UPDATE TO authenticated
  USING (is_super_admin() OR team_id IN (SELECT user_team_ids()));

CREATE POLICY "matchups_delete" ON matchups FOR DELETE TO authenticated
  USING (is_super_admin() OR team_id IN (SELECT user_team_ids()));
