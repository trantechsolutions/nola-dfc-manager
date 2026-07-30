-- Lets a parent update a small, deliberately-scoped set of fields on their
-- own child's record from the Parent view: birthdate, shirt size, sibling
-- count (players), and a guardian's phone number (guardians).
--
-- Run this against an existing project. rls_policies.sql has been updated
-- to include these two functions for fresh installs.
--
-- Same root cause as fix_guardian_medical_release_rls.sql: players_update /
-- guardians_update only allow club staff (club_id IN user_club_ids()).
-- Postgres RLS gates whole rows, not columns, so a policy broad enough to
-- let a parent UPDATE players directly would also let them change club_id,
-- team_id, status, jersey_number, etc. on the same row. A plain UPDATE from
-- a parent session matches zero rows and returns success — indistinguishable
-- from the client, from "nothing to save" — so this has to be a
-- SECURITY DEFINER RPC scoped to just these columns, not a new RLS policy.

CREATE OR REPLACE FUNCTION update_guardian_player_details(
  p_player_id      uuid,
  p_birthdate      date,
  p_shirt_size     text,
  p_siblings_count smallint
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  -- Caller must be a guardian of this player.
  IF NOT EXISTS (
    SELECT 1 FROM user_guardian_player_ids() gp(player_id)
    WHERE gp.player_id = p_player_id
  ) THEN
    RETURN false;
  END IF;

  IF p_siblings_count IS NOT NULL AND p_siblings_count < 0 THEN
    RETURN false;
  END IF;

  UPDATE players
  SET birthdate = p_birthdate,
      shirt_size = p_shirt_size,
      siblings_count = p_siblings_count
  WHERE id = p_player_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION update_guardian_player_details(uuid, date, text, smallint) FROM public;
GRANT EXECUTE ON FUNCTION update_guardian_player_details(uuid, date, text, smallint) TO authenticated;


-- A parent may update the phone number for any guardian attached to their
-- own child (e.g. the other parent's number), matching how PlayerModal /
-- ParentView already display every guardian on the player without
-- restricting by which one is the signed-in user. Name/email are excluded
-- deliberately: email drives the guardians<->user_profiles login match via
-- user_guardian_player_ids(), so letting a parent edit it here could sever
-- or hijack that link.
CREATE OR REPLACE FUNCTION update_guardian_phone(
  p_guardian_id uuid,
  p_phone       text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  UPDATE guardians g
  SET phone = p_phone
  WHERE g.id = p_guardian_id
    AND g.player_id IN (SELECT user_guardian_player_ids());

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION update_guardian_phone(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION update_guardian_phone(uuid, text) TO authenticated;
