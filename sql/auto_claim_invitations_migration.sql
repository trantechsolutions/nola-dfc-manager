-- Auto-claim pending invitations when a user signs in.
--
-- Usage: client calls `supabase.rpc('claim_my_invitations')` after login.
-- The function runs as SECURITY DEFINER so the newly signed-up user can
-- read/update their own invitations (which are otherwise RLS-restricted
-- to existing club members) and insert into user_roles without needing
-- an explicit policy grant.
--
-- Safe to re-run: roles that already exist are skipped, invitations that
-- are already accepted/expired/revoked are ignored.

CREATE OR REPLACE FUNCTION claim_my_invitations()
RETURNS TABLE (role text, club_id uuid, team_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email   text;
  inv       RECORD;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  SELECT lower(u.email) INTO v_email FROM auth.users u WHERE u.id = v_user_id;
  IF v_email IS NULL THEN
    RETURN;
  END IF;

  FOR inv IN
    SELECT i.*
    FROM invitations i
    WHERE lower(i.email) = v_email
      AND i.status = 'pending'
      AND (i.expires_at IS NULL OR i.expires_at > now())
  LOOP
    -- Skip if this user already holds the same role/scope
    IF NOT EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = v_user_id
        AND ur.role = inv.role
        AND ur.club_id IS NOT DISTINCT FROM CASE WHEN inv.role LIKE 'club_%' THEN inv.club_id ELSE NULL END
        AND ur.team_id IS NOT DISTINCT FROM CASE WHEN inv.role LIKE 'club_%' THEN NULL ELSE inv.team_id END
    ) THEN
      INSERT INTO user_roles (user_id, role, club_id, team_id)
      VALUES (
        v_user_id,
        inv.role,
        CASE WHEN inv.role LIKE 'club_%' THEN inv.club_id ELSE NULL END,
        CASE WHEN inv.role LIKE 'club_%' THEN NULL ELSE inv.team_id END
      );
    END IF;

    UPDATE invitations
    SET status = 'accepted',
        accepted_by = v_user_id,
        accepted_at = now()
    WHERE id = inv.id;

    role := inv.role;
    club_id := inv.club_id;
    team_id := inv.team_id;
    RETURN NEXT;
  END LOOP;

  -- Ensure a user_profile row exists so guardian-email joins work.
  INSERT INTO user_profiles (user_id, email, display_name)
  VALUES (v_user_id, v_email, split_part(v_email, '@', 1))
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

-- The accepted_by / accepted_at columns are referenced by the existing
-- acceptInvitation() client code but may not exist on older databases.
-- Add them if missing so both code paths stay compatible.
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS accepted_by uuid;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

GRANT EXECUTE ON FUNCTION claim_my_invitations() TO authenticated;
