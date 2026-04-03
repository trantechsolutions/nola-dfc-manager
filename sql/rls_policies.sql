-- ============================================================
-- Row-Level Security Policies
-- Scope: Club-based isolation
--
-- Strategy: Users can only access data belonging to clubs
-- they have a role in (via user_roles table).
-- Super admins bypass via a separate check.
-- Parents access via guardian email matching.
--
-- Run this AFTER dropping the existing permissive policies.
-- ============================================================

-- Helper function: get all club IDs the current user has access to
CREATE OR REPLACE FUNCTION user_club_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT DISTINCT COALESCE(ur.club_id, t.club_id)
  FROM user_roles ur
  LEFT JOIN teams t ON ur.team_id = t.id
  WHERE ur.user_id = auth.uid()
  AND (ur.club_id IS NOT NULL OR t.club_id IS NOT NULL)
$$;

-- Helper function: check if user is a super_admin
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin'
  )
$$;

-- Helper function: get all team IDs the current user has access to
CREATE OR REPLACE FUNCTION user_team_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  -- Direct team roles
  SELECT team_id FROM user_roles WHERE user_id = auth.uid() AND team_id IS NOT NULL
  UNION
  -- Club-level roles grant access to all teams in the club
  SELECT t.id FROM teams t
  JOIN user_roles ur ON ur.club_id = t.club_id
  WHERE ur.user_id = auth.uid() AND ur.club_id IS NOT NULL
$$;

-- Helper function: get player IDs this user is a guardian of
CREATE OR REPLACE FUNCTION user_guardian_player_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT g.player_id FROM guardians g
  JOIN user_profiles up ON lower(g.email) = lower(up.email)
  WHERE up.user_id = auth.uid()
$$;


-- ============================================================
-- DROP all existing permissive policies first
-- ============================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT policyname, tablename
    FROM pg_policies
    WHERE schemaname = 'public'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I', r.policyname, r.tablename);
  END LOOP;
END $$;


-- ============================================================
-- CLUBS
-- ============================================================
CREATE POLICY "clubs_select" ON clubs FOR SELECT TO authenticated
  USING (is_super_admin() OR id IN (SELECT user_club_ids()));

CREATE POLICY "clubs_insert" ON clubs FOR INSERT TO authenticated
  WITH CHECK (is_super_admin());

CREATE POLICY "clubs_update" ON clubs FOR UPDATE TO authenticated
  USING (is_super_admin() OR id IN (SELECT user_club_ids()));

CREATE POLICY "clubs_delete" ON clubs FOR DELETE TO authenticated
  USING (is_super_admin());


-- ============================================================
-- TEAMS
-- ============================================================
CREATE POLICY "teams_select" ON teams FOR SELECT TO authenticated
  USING (is_super_admin() OR club_id IN (SELECT user_club_ids()));

CREATE POLICY "teams_insert" ON teams FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR club_id IN (SELECT user_club_ids()));

CREATE POLICY "teams_update" ON teams FOR UPDATE TO authenticated
  USING (is_super_admin() OR club_id IN (SELECT user_club_ids()));

CREATE POLICY "teams_delete" ON teams FOR DELETE TO authenticated
  USING (is_super_admin() OR club_id IN (SELECT user_club_ids()));


-- ============================================================
-- PLAYERS
-- ============================================================
CREATE POLICY "players_select" ON players FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR club_id IN (SELECT user_club_ids())
    OR id IN (SELECT user_guardian_player_ids())
  );

CREATE POLICY "players_insert" ON players FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR club_id IN (SELECT user_club_ids()));

CREATE POLICY "players_update" ON players FOR UPDATE TO authenticated
  USING (is_super_admin() OR club_id IN (SELECT user_club_ids()));

CREATE POLICY "players_delete" ON players FOR DELETE TO authenticated
  USING (is_super_admin() OR club_id IN (SELECT user_club_ids()));


-- ============================================================
-- GUARDIANS
-- ============================================================
CREATE POLICY "guardians_select" ON guardians FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR player_id IN (SELECT id FROM players WHERE club_id IN (SELECT user_club_ids()))
    OR player_id IN (SELECT user_guardian_player_ids())
  );

CREATE POLICY "guardians_insert" ON guardians FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin()
    OR player_id IN (SELECT id FROM players WHERE club_id IN (SELECT user_club_ids()))
  );

CREATE POLICY "guardians_update" ON guardians FOR UPDATE TO authenticated
  USING (
    is_super_admin()
    OR player_id IN (SELECT id FROM players WHERE club_id IN (SELECT user_club_ids()))
  );

CREATE POLICY "guardians_delete" ON guardians FOR DELETE TO authenticated
  USING (
    is_super_admin()
    OR player_id IN (SELECT id FROM players WHERE club_id IN (SELECT user_club_ids()))
  );


-- ============================================================
-- SEASONS (global — all authenticated users can read)
-- ============================================================
CREATE POLICY "seasons_select" ON seasons FOR SELECT TO authenticated USING (true);
CREATE POLICY "seasons_insert" ON seasons FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "seasons_update" ON seasons FOR UPDATE TO authenticated USING (true);


-- ============================================================
-- TEAM_SEASONS
-- ============================================================
CREATE POLICY "team_seasons_select" ON team_seasons FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR team_id IN (SELECT user_team_ids())
    -- Parents need team_seasons for financial calculations
    OR team_id IN (SELECT team_id FROM players WHERE id IN (SELECT user_guardian_player_ids()))
  );

CREATE POLICY "team_seasons_insert" ON team_seasons FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR team_id IN (SELECT user_team_ids()));

CREATE POLICY "team_seasons_update" ON team_seasons FOR UPDATE TO authenticated
  USING (is_super_admin() OR team_id IN (SELECT user_team_ids()));

CREATE POLICY "team_seasons_delete" ON team_seasons FOR DELETE TO authenticated
  USING (is_super_admin() OR team_id IN (SELECT user_team_ids()));


-- ============================================================
-- PLAYER_SEASONS
-- ============================================================
CREATE POLICY "player_seasons_select" ON player_seasons FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR player_id IN (SELECT id FROM players WHERE club_id IN (SELECT user_club_ids()))
    OR player_id IN (SELECT user_guardian_player_ids())
  );

CREATE POLICY "player_seasons_insert" ON player_seasons FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin()
    OR player_id IN (SELECT id FROM players WHERE club_id IN (SELECT user_club_ids()))
  );

CREATE POLICY "player_seasons_update" ON player_seasons FOR UPDATE TO authenticated
  USING (
    is_super_admin()
    OR player_id IN (SELECT id FROM players WHERE club_id IN (SELECT user_club_ids()))
  );

CREATE POLICY "player_seasons_delete" ON player_seasons FOR DELETE TO authenticated
  USING (
    is_super_admin()
    OR player_id IN (SELECT id FROM players WHERE club_id IN (SELECT user_club_ids()))
  );


-- ============================================================
-- TRANSACTIONS
-- ============================================================
CREATE POLICY "transactions_select" ON transactions FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR team_season_id IN (SELECT id FROM team_seasons WHERE team_id IN (SELECT user_team_ids()))
    -- Parents can see their own transactions
    OR player_id IN (SELECT user_guardian_player_ids())
  );

CREATE POLICY "transactions_insert" ON transactions FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin()
    OR team_season_id IN (SELECT id FROM team_seasons WHERE team_id IN (SELECT user_team_ids()))
  );

CREATE POLICY "transactions_update" ON transactions FOR UPDATE TO authenticated
  USING (
    is_super_admin()
    OR team_season_id IN (SELECT id FROM team_seasons WHERE team_id IN (SELECT user_team_ids()))
  );

CREATE POLICY "transactions_delete" ON transactions FOR DELETE TO authenticated
  USING (
    is_super_admin()
    OR team_season_id IN (SELECT id FROM team_seasons WHERE team_id IN (SELECT user_team_ids()))
  );


-- ============================================================
-- BUDGET_ITEMS
-- ============================================================
CREATE POLICY "budget_items_select" ON budget_items FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR team_season_id IN (SELECT id FROM team_seasons WHERE team_id IN (SELECT user_team_ids()))
  );

CREATE POLICY "budget_items_insert" ON budget_items FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin()
    OR team_season_id IN (SELECT id FROM team_seasons WHERE team_id IN (SELECT user_team_ids()))
  );

CREATE POLICY "budget_items_update" ON budget_items FOR UPDATE TO authenticated
  USING (
    is_super_admin()
    OR team_season_id IN (SELECT id FROM team_seasons WHERE team_id IN (SELECT user_team_ids()))
  );

CREATE POLICY "budget_items_delete" ON budget_items FOR DELETE TO authenticated
  USING (
    is_super_admin()
    OR team_season_id IN (SELECT id FROM team_seasons WHERE team_id IN (SELECT user_team_ids()))
  );


-- ============================================================
-- DOCUMENTS
-- ============================================================
CREATE POLICY "documents_select" ON documents FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR club_id IN (SELECT user_club_ids())
    OR player_id IN (SELECT user_guardian_player_ids())
  );

CREATE POLICY "documents_insert" ON documents FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin()
    OR club_id IN (SELECT user_club_ids())
    OR player_id IN (SELECT user_guardian_player_ids())
  );

CREATE POLICY "documents_update" ON documents FOR UPDATE TO authenticated
  USING (is_super_admin() OR club_id IN (SELECT user_club_ids()));

CREATE POLICY "documents_delete" ON documents FOR DELETE TO authenticated
  USING (is_super_admin() OR club_id IN (SELECT user_club_ids()));


-- ============================================================
-- MEDICAL_FORMS
-- ============================================================
CREATE POLICY "medical_forms_select" ON medical_forms FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR player_id IN (SELECT id FROM players WHERE club_id IN (SELECT user_club_ids()))
    OR player_id IN (SELECT user_guardian_player_ids())
  );

CREATE POLICY "medical_forms_insert" ON medical_forms FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin()
    OR player_id IN (SELECT id FROM players WHERE club_id IN (SELECT user_club_ids()))
    OR player_id IN (SELECT user_guardian_player_ids())
  );

CREATE POLICY "medical_forms_update" ON medical_forms FOR UPDATE TO authenticated
  USING (
    is_super_admin()
    OR player_id IN (SELECT id FROM players WHERE club_id IN (SELECT user_club_ids()))
    OR player_id IN (SELECT user_guardian_player_ids())
  );

CREATE POLICY "medical_forms_delete" ON medical_forms FOR DELETE TO authenticated
  USING (
    is_super_admin()
    OR player_id IN (SELECT id FROM players WHERE club_id IN (SELECT user_club_ids()))
  );


-- ============================================================
-- USER_PROFILES (users can see/edit their own)
-- ============================================================
CREATE POLICY "user_profiles_select" ON user_profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "user_profiles_insert" ON user_profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR is_super_admin());

CREATE POLICY "user_profiles_update" ON user_profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR is_super_admin());


-- ============================================================
-- USER_ROLES
-- ============================================================
CREATE POLICY "user_roles_select" ON user_roles FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR is_super_admin()
    OR club_id IN (SELECT user_club_ids())
    OR team_id IN (SELECT user_team_ids())
  );

CREATE POLICY "user_roles_insert" ON user_roles FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR club_id IN (SELECT user_club_ids()));

CREATE POLICY "user_roles_update" ON user_roles FOR UPDATE TO authenticated
  USING (is_super_admin() OR club_id IN (SELECT user_club_ids()));

CREATE POLICY "user_roles_delete" ON user_roles FOR DELETE TO authenticated
  USING (is_super_admin() OR club_id IN (SELECT user_club_ids()));


-- ============================================================
-- BLACKOUTS
-- ============================================================
CREATE POLICY "blackouts_select" ON blackouts FOR SELECT TO authenticated
  USING (is_super_admin() OR team_id IN (SELECT user_team_ids()) OR team_id IS NULL);

CREATE POLICY "blackouts_insert" ON blackouts FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR team_id IN (SELECT user_team_ids()));

CREATE POLICY "blackouts_update" ON blackouts FOR UPDATE TO authenticated
  USING (is_super_admin() OR team_id IN (SELECT user_team_ids()));

CREATE POLICY "blackouts_delete" ON blackouts FOR DELETE TO authenticated
  USING (is_super_admin() OR team_id IN (SELECT user_team_ids()));


-- ============================================================
-- TEAM_EVENTS
-- ============================================================
CREATE POLICY "team_events_select" ON team_events FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR team_id IN (SELECT user_team_ids())
    -- Parents can see their team's events
    OR team_id IN (SELECT team_id FROM players WHERE id IN (SELECT user_guardian_player_ids()))
  );

CREATE POLICY "team_events_insert" ON team_events FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR team_id IN (SELECT user_team_ids()));

CREATE POLICY "team_events_update" ON team_events FOR UPDATE TO authenticated
  USING (is_super_admin() OR team_id IN (SELECT user_team_ids()));

CREATE POLICY "team_events_delete" ON team_events FOR DELETE TO authenticated
  USING (is_super_admin() OR team_id IN (SELECT user_team_ids()));


-- ============================================================
-- CUSTOM_CATEGORIES
-- ============================================================
CREATE POLICY "custom_categories_select" ON custom_categories FOR SELECT TO authenticated
  USING (is_super_admin() OR club_id IN (SELECT user_club_ids()));

CREATE POLICY "custom_categories_insert" ON custom_categories FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR club_id IN (SELECT user_club_ids()));

CREATE POLICY "custom_categories_update" ON custom_categories FOR UPDATE TO authenticated
  USING (is_super_admin() OR club_id IN (SELECT user_club_ids()));

CREATE POLICY "custom_categories_delete" ON custom_categories FOR DELETE TO authenticated
  USING (is_super_admin() OR club_id IN (SELECT user_club_ids()));


-- ============================================================
-- CHANGELOGS (public read, service-role write)
-- ============================================================
CREATE POLICY "changelogs_select" ON changelogs FOR SELECT TO authenticated USING (true);
-- Insert/update handled by service role key (post-commit hook)


-- ============================================================
-- INVITATIONS
-- ============================================================
CREATE POLICY "invitations_select" ON invitations FOR SELECT TO authenticated
  USING (is_super_admin() OR club_id IN (SELECT user_club_ids()));

CREATE POLICY "invitations_insert" ON invitations FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR club_id IN (SELECT user_club_ids()));

CREATE POLICY "invitations_delete" ON invitations FOR DELETE TO authenticated
  USING (is_super_admin() OR club_id IN (SELECT user_club_ids()));


-- ============================================================
-- PLAYER_FINANCIALS VIEW (no RLS needed — views inherit from base tables)
-- ============================================================


-- ============================================================
-- EVALUATION TABLES (club-scoped)
-- ============================================================

-- evaluation_sessions
CREATE POLICY "eval_sessions_select" ON evaluation_sessions FOR SELECT TO authenticated
  USING (is_super_admin() OR club_id IN (SELECT user_club_ids()));
CREATE POLICY "eval_sessions_insert" ON evaluation_sessions FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR club_id IN (SELECT user_club_ids()));
CREATE POLICY "eval_sessions_update" ON evaluation_sessions FOR UPDATE TO authenticated
  USING (is_super_admin() OR club_id IN (SELECT user_club_ids()));
CREATE POLICY "eval_sessions_delete" ON evaluation_sessions FOR DELETE TO authenticated
  USING (is_super_admin() OR club_id IN (SELECT user_club_ids()));

-- evaluation_categories (cascade via session)
CREATE POLICY "eval_categories_select" ON evaluation_categories FOR SELECT TO authenticated
  USING (session_id IN (SELECT id FROM evaluation_sessions WHERE is_super_admin() OR club_id IN (SELECT user_club_ids())));
CREATE POLICY "eval_categories_insert" ON evaluation_categories FOR INSERT TO authenticated
  WITH CHECK (session_id IN (SELECT id FROM evaluation_sessions WHERE is_super_admin() OR club_id IN (SELECT user_club_ids())));
CREATE POLICY "eval_categories_update" ON evaluation_categories FOR UPDATE TO authenticated
  USING (session_id IN (SELECT id FROM evaluation_sessions WHERE is_super_admin() OR club_id IN (SELECT user_club_ids())));
CREATE POLICY "eval_categories_delete" ON evaluation_categories FOR DELETE TO authenticated
  USING (session_id IN (SELECT id FROM evaluation_sessions WHERE is_super_admin() OR club_id IN (SELECT user_club_ids())));

-- evaluation_candidates
CREATE POLICY "eval_candidates_select" ON evaluation_candidates FOR SELECT TO authenticated
  USING (session_id IN (SELECT id FROM evaluation_sessions WHERE is_super_admin() OR club_id IN (SELECT user_club_ids())));
CREATE POLICY "eval_candidates_insert" ON evaluation_candidates FOR INSERT TO authenticated
  WITH CHECK (session_id IN (SELECT id FROM evaluation_sessions WHERE is_super_admin() OR club_id IN (SELECT user_club_ids())));
CREATE POLICY "eval_candidates_update" ON evaluation_candidates FOR UPDATE TO authenticated
  USING (session_id IN (SELECT id FROM evaluation_sessions WHERE is_super_admin() OR club_id IN (SELECT user_club_ids())));
CREATE POLICY "eval_candidates_delete" ON evaluation_candidates FOR DELETE TO authenticated
  USING (session_id IN (SELECT id FROM evaluation_sessions WHERE is_super_admin() OR club_id IN (SELECT user_club_ids())));

-- evaluation_scores
CREATE POLICY "eval_scores_select" ON evaluation_scores FOR SELECT TO authenticated
  USING (candidate_id IN (SELECT id FROM evaluation_candidates WHERE session_id IN (SELECT id FROM evaluation_sessions WHERE is_super_admin() OR club_id IN (SELECT user_club_ids()))));
CREATE POLICY "eval_scores_insert" ON evaluation_scores FOR INSERT TO authenticated
  WITH CHECK (candidate_id IN (SELECT id FROM evaluation_candidates WHERE session_id IN (SELECT id FROM evaluation_sessions WHERE is_super_admin() OR club_id IN (SELECT user_club_ids()))));
CREATE POLICY "eval_scores_update" ON evaluation_scores FOR UPDATE TO authenticated
  USING (candidate_id IN (SELECT id FROM evaluation_candidates WHERE session_id IN (SELECT id FROM evaluation_sessions WHERE is_super_admin() OR club_id IN (SELECT user_club_ids()))));
CREATE POLICY "eval_scores_delete" ON evaluation_scores FOR DELETE TO authenticated
  USING (candidate_id IN (SELECT id FROM evaluation_candidates WHERE session_id IN (SELECT id FROM evaluation_sessions WHERE is_super_admin() OR club_id IN (SELECT user_club_ids()))));

-- evaluation_evaluators
CREATE POLICY "eval_evaluators_select" ON evaluation_evaluators FOR SELECT TO authenticated
  USING (session_id IN (SELECT id FROM evaluation_sessions WHERE is_super_admin() OR club_id IN (SELECT user_club_ids())));
CREATE POLICY "eval_evaluators_insert" ON evaluation_evaluators FOR INSERT TO authenticated
  WITH CHECK (session_id IN (SELECT id FROM evaluation_sessions WHERE is_super_admin() OR club_id IN (SELECT user_club_ids())));
CREATE POLICY "eval_evaluators_update" ON evaluation_evaluators FOR UPDATE TO authenticated
  USING (session_id IN (SELECT id FROM evaluation_sessions WHERE is_super_admin() OR club_id IN (SELECT user_club_ids())));
CREATE POLICY "eval_evaluators_delete" ON evaluation_evaluators FOR DELETE TO authenticated
  USING (session_id IN (SELECT id FROM evaluation_sessions WHERE is_super_admin() OR club_id IN (SELECT user_club_ids())));

-- evaluation_team_thresholds
CREATE POLICY "eval_thresholds_select" ON evaluation_team_thresholds FOR SELECT TO authenticated
  USING (session_id IN (SELECT id FROM evaluation_sessions WHERE is_super_admin() OR club_id IN (SELECT user_club_ids())));
CREATE POLICY "eval_thresholds_insert" ON evaluation_team_thresholds FOR INSERT TO authenticated
  WITH CHECK (session_id IN (SELECT id FROM evaluation_sessions WHERE is_super_admin() OR club_id IN (SELECT user_club_ids())));
CREATE POLICY "eval_thresholds_update" ON evaluation_team_thresholds FOR UPDATE TO authenticated
  USING (session_id IN (SELECT id FROM evaluation_sessions WHERE is_super_admin() OR club_id IN (SELECT user_club_ids())));
CREATE POLICY "eval_thresholds_delete" ON evaluation_team_thresholds FOR DELETE TO authenticated
  USING (session_id IN (SELECT id FROM evaluation_sessions WHERE is_super_admin() OR club_id IN (SELECT user_club_ids())));


-- ============================================================
-- SEASON_EVALUATIONS
-- ============================================================
CREATE POLICY "season_eval_select" ON season_evaluations FOR SELECT TO authenticated
  USING (
    is_super_admin()
    OR team_id IN (SELECT user_team_ids())
  );

CREATE POLICY "season_eval_insert" ON season_evaluations FOR INSERT TO authenticated
  WITH CHECK (is_super_admin() OR team_id IN (SELECT user_team_ids()));

CREATE POLICY "season_eval_update" ON season_evaluations FOR UPDATE TO authenticated
  USING (is_super_admin() OR team_id IN (SELECT user_team_ids()));

CREATE POLICY "season_eval_delete" ON season_evaluations FOR DELETE TO authenticated
  USING (is_super_admin() OR team_id IN (SELECT user_team_ids()));


-- ============================================================
-- Grant execute on helper functions
-- ============================================================
GRANT EXECUTE ON FUNCTION user_club_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION user_team_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION user_guardian_player_ids() TO authenticated;
