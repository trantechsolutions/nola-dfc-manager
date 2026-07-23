-- Let a super_admin account be disabled without deleting its role assignment.
-- Disabling sets user_profiles.is_active = false; is_super_admin() then stops
-- treating that user as a super admin, so RLS shuts them out everywhere the
-- helper is used, not just in the UI.
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_roles ur
    LEFT JOIN user_profiles up ON up.user_id = ur.user_id
    WHERE ur.user_id = auth.uid()
    AND ur.role = 'super_admin'
    AND COALESCE(up.is_active, true)
  )
$$;
