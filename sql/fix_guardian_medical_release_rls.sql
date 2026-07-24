-- Fixes: a parent signs the in-app Medical Release form and, after the form
-- and PDF have already saved, gets
--   "No 2026-2027 season enrollment found for this player — compliance was
--    not updated."
-- even though the player IS enrolled in that season.
--
-- Root cause: RLS, not a missing enrollment row. player_seasons has
--   player_seasons_select ... OR player_id IN (SELECT user_guardian_player_ids())
--   player_seasons_update ... club members / super admin ONLY
-- (see rls_policies.sql). A guardian can read their own player's enrollment
-- but has no UPDATE policy, so
--   UPDATE player_seasons SET medical_release = true WHERE player_id = ...
-- is filtered down to zero rows and returns success with an empty result --
-- indistinguishable, from the client, from the row not existing at all. The
-- guard added for the genuinely-missing-row case
-- (fix_missing_player_season_enrollment.sql) therefore reported the wrong
-- cause to parents.
--
-- Fix: a SECURITY DEFINER RPC that lets a guardian set medical_release on
-- their OWN player's enrollment and nothing else. A plain UPDATE policy is
-- not enough here -- Postgres RLS gates whole rows, not columns, so any
-- policy broad enough to allow this would also let a parent flip
-- fee_waived, status, reeplayer_waiver or team_season_id on the same row.
--
-- Client: playerService.setSeasonCompliance() falls back to this RPC when a
-- direct UPDATE matches no rows but the enrollment row is readable.

CREATE OR REPLACE FUNCTION set_guardian_medical_release(
  p_player_id uuid,
  p_season_id text,
  p_value     boolean
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

  -- Caller must be a guardian of this player. user_guardian_player_ids()
  -- matches guardians.email to the signed-in user's profile email.
  IF NOT EXISTS (
    SELECT 1 FROM user_guardian_player_ids() gp(player_id)
    WHERE gp.player_id = p_player_id
  ) THEN
    RETURN false;
  END IF;

  UPDATE player_seasons
  SET medical_release = coalesce(p_value, true)
  WHERE player_id = p_player_id
    AND season_id = p_season_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION set_guardian_medical_release(uuid, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION set_guardian_medical_release(uuid, text, boolean) TO authenticated;
