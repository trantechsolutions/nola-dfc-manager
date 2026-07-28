-- ============================================================
-- Opponent Contacts
--
-- A lightweight directory of who to call/email at an outside club or
-- team when arranging a matchup. Scoped to team_id, not linked to a
-- specific matchup row, since the same opponent contact is reused
-- across many weeks' negotiations.
--
-- Run this against an existing project. complete_schema.sql has been
-- updated to include this table for fresh installs.
-- ============================================================

CREATE TABLE IF NOT EXISTS opponent_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id),
  club_name text NOT NULL,
  contact_name text,
  email text,
  phone text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_opponent_contacts_team ON opponent_contacts(team_id);

CREATE OR REPLACE FUNCTION set_opponent_contacts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS opponent_contacts_updated_at ON opponent_contacts;
CREATE TRIGGER opponent_contacts_updated_at
  BEFORE UPDATE ON opponent_contacts
  FOR EACH ROW EXECUTE FUNCTION set_opponent_contacts_updated_at();

-- ── RLS ──
-- Staff-only (no parent visibility) — this is scheduling logistics, not
-- something a parent needs to see, unlike team_events/matchups.
ALTER TABLE opponent_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "opponent_contacts_select" ON opponent_contacts FOR SELECT TO authenticated
  USING (is_super_admin() OR team_id IN (SELECT user_team_ids()));

CREATE POLICY "opponent_contacts_insert" ON opponent_contacts FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR team_id IN (SELECT user_team_ids()));

CREATE POLICY "opponent_contacts_update" ON opponent_contacts FOR UPDATE TO authenticated
  USING (is_super_admin() OR team_id IN (SELECT user_team_ids()));

CREATE POLICY "opponent_contacts_delete" ON opponent_contacts FOR DELETE TO authenticated
  USING (is_super_admin() OR team_id IN (SELECT user_team_ids()));
