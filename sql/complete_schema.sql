-- ============================================================
-- NOLA DFC Manager — Complete Database Schema
-- Run this on a fresh Supabase project to create all tables.
-- ============================================================

-- ── 1. CLUBS ──
CREATE TABLE IF NOT EXISTS clubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo_url text,
  settings jsonb,
  created_at timestamptz DEFAULT now()
);

-- ── 2. TEAMS ──
CREATE TABLE IF NOT EXISTS teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id),
  name text NOT NULL,
  age_group text,
  gender text,
  tier text,
  ical_url text,
  payment_info text DEFAULT '',
  color_primary text,
  color_secondary text,
  status text DEFAULT 'active'
);

-- ── 3. PLAYERS ──
CREATE TABLE IF NOT EXISTS players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id),
  team_id uuid REFERENCES teams(id),
  first_name text NOT NULL,
  last_name text NOT NULL,
  jersey_number text,
  birthdate date,
  gender text,
  status text DEFAULT 'active' CHECK (status IN ('active', 'archived', 'prospect')),
  medical_release boolean DEFAULT false,
  reeplayer_waiver boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- ── 4. GUARDIANS ──
CREATE TABLE IF NOT EXISTS guardians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text
);

-- ── 5. SEASONS ──
CREATE TABLE IF NOT EXISTS seasons (
  id text PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- ── 6. TEAM SEASONS ──
CREATE TABLE IF NOT EXISTS team_seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id),
  season_id text NOT NULL REFERENCES seasons(id),
  is_finalized boolean DEFAULT false,
  base_fee numeric(10,2) DEFAULT 0,
  buffer_percent numeric DEFAULT 5,
  expected_roster_size integer,
  total_projected_expenses numeric(10,2),
  total_projected_income numeric(10,2),
  created_at timestamptz DEFAULT now(),
  UNIQUE(team_id, season_id)
);

-- ── 7. PLAYER SEASONS ──
CREATE TABLE IF NOT EXISTS player_seasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  season_id text NOT NULL REFERENCES seasons(id),
  team_season_id uuid REFERENCES team_seasons(id),
  fee_waived boolean DEFAULT false,
  fundraiser_buyin boolean DEFAULT false,
  status text DEFAULT 'active',
  UNIQUE(player_id, season_id)
);

-- ── 8. TEAM EVENTS (iCal sync) ──
CREATE TABLE IF NOT EXISTS team_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES teams(id),
  uid text NOT NULL,
  title text,
  description text,
  location text,
  event_date timestamptz,
  event_type text DEFAULT 'event',
  type_locked boolean DEFAULT false,
  is_cancelled boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(team_id, uid)
);

-- ── 9. TRANSACTIONS ──
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id text NOT NULL REFERENCES seasons(id),
  team_season_id uuid REFERENCES team_seasons(id),
  player_id uuid REFERENCES players(id),
  event_id uuid REFERENCES team_events(id) ON DELETE SET NULL,
  date date NOT NULL,
  amount numeric(10,2) NOT NULL,
  split numeric(10,2),
  type text,
  category text NOT NULL,
  title text NOT NULL,
  notes text,
  cleared boolean DEFAULT false,
  distributed boolean DEFAULT false,
  waterfall_batch_id text,
  original_tx_id uuid REFERENCES transactions(id),
  transfer_from text,
  transfer_to text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── 10. BUDGET ITEMS ──
CREATE TABLE IF NOT EXISTS budget_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id text NOT NULL REFERENCES seasons(id),
  team_season_id uuid NOT NULL REFERENCES team_seasons(id),
  category text NOT NULL,
  label text NOT NULL DEFAULT '',
  income numeric(10,2) DEFAULT 0,
  expenses_fall numeric(10,2) DEFAULT 0,
  expenses_spring numeric(10,2) DEFAULT 0
);

-- ── 11. BUDGET AMENDMENTS ──
CREATE TABLE IF NOT EXISTS budget_amendments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_season_id uuid NOT NULL REFERENCES team_seasons(id) ON DELETE CASCADE,
  amendment_number integer NOT NULL DEFAULT 1,
  reason text,
  amended_total_expenses numeric(10,2) DEFAULT 0,
  amended_total_income numeric(10,2) DEFAULT 0,
  amended_base_fee numeric(10,2) DEFAULT 0,
  amended_at timestamptz NOT NULL DEFAULT now(),
  amended_by uuid
);

-- ── 12. DOCUMENTS ──
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid REFERENCES players(id),
  team_id uuid REFERENCES teams(id),
  club_id uuid REFERENCES clubs(id),
  season_id text REFERENCES seasons(id),
  doc_type text NOT NULL,
  title text,
  file_name text,
  file_path text,
  mime_type text,
  file_size integer,
  status text DEFAULT 'uploaded',
  verified_by uuid,
  verified_at timestamptz,
  expires_at timestamptz,
  notes text,
  uploaded_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── 13. MEDICAL FORMS ──
CREATE TABLE IF NOT EXISTS medical_forms (
  player_id uuid PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
  data jsonb NOT NULL DEFAULT '{}',
  language text DEFAULT 'en',
  completed_at timestamptz,
  updated_at timestamptz DEFAULT now()
);

-- ── 14. USER PROFILES ──
CREATE TABLE IF NOT EXISTS user_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  display_name text,
  email text,
  phone text,
  is_active boolean DEFAULT true,
  last_login timestamptz
);

-- ── 15. USER ROLES ──
CREATE TABLE IF NOT EXISTS user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('super_admin', 'club_admin', 'club_manager', 'team_manager', 'team_admin', 'treasurer', 'scheduler', 'head_coach', 'assistant_coach', 'parent')),
  club_id uuid REFERENCES clubs(id),
  team_id uuid REFERENCES teams(id),
  created_at timestamptz DEFAULT now()
);

-- ── 16. INVITATIONS ──
CREATE TABLE IF NOT EXISTS invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid REFERENCES clubs(id),
  team_id uuid REFERENCES teams(id),
  email text NOT NULL,
  role text NOT NULL,
  invited_name text,
  invited_by uuid,
  token text DEFAULT gen_random_uuid()::text,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at timestamptz DEFAULT (now() + interval '30 days'),
  created_at timestamptz DEFAULT now()
);

-- ── 17. BLACKOUTS ──
CREATE TABLE IF NOT EXISTS blackouts (
  date_str text PRIMARY KEY,
  team_id uuid REFERENCES teams(id),
  is_blackout boolean DEFAULT true
);

-- ── 18. CUSTOM CATEGORIES ──
CREATE TABLE IF NOT EXISTS custom_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id),
  code text NOT NULL,
  label text NOT NULL,
  description text,
  color text,
  flow text DEFAULT 'expense',
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ── 19. CHANGELOGS ──
CREATE TABLE IF NOT EXISTS changelogs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  build_number integer NOT NULL,
  commit_hash text NOT NULL UNIQUE,
  commit_short text NOT NULL,
  commit_message text NOT NULL,
  commit_date timestamptz NOT NULL,
  ai_summary jsonb,
  created_at timestamptz DEFAULT now()
);

-- ── 20. EVALUATION SESSIONS ──
CREATE TABLE IF NOT EXISTS evaluation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id),
  season_id text REFERENCES seasons(id),
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed')),
  score_scale int NOT NULL DEFAULT 5 CHECK (score_scale IN (5, 10)),
  created_by uuid NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ── 21. EVALUATION CATEGORIES ──
CREATE TABLE IF NOT EXISTS evaluation_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES evaluation_sessions(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  weight numeric NOT NULL DEFAULT 1,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- ── 22. EVALUATION CANDIDATES ──
CREATE TABLE IF NOT EXISTS evaluation_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES evaluation_sessions(id) ON DELETE CASCADE,
  player_id uuid REFERENCES players(id),
  first_name text NOT NULL,
  last_name text NOT NULL,
  bib_number int,
  birthdate date,
  gender text,
  age_group text,
  position text,
  notes text,
  overall_score numeric,
  placed_team_id uuid REFERENCES teams(id),
  placement_status text NOT NULL DEFAULT 'pending' CHECK (placement_status IN ('pending', 'placed', 'declined', 'waitlist')),
  created_at timestamptz DEFAULT now()
);

-- ── 23. EVALUATION SCORES ──
CREATE TABLE IF NOT EXISTS evaluation_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id uuid NOT NULL REFERENCES evaluation_candidates(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES evaluation_categories(id) ON DELETE CASCADE,
  evaluator_id uuid NOT NULL,
  score numeric NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(candidate_id, category_id, evaluator_id)
);

-- ── 24. EVALUATION EVALUATORS ──
CREATE TABLE IF NOT EXISTS evaluation_evaluators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES evaluation_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  display_name text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(session_id, user_id)
);

-- ── 25. EVALUATION TEAM THRESHOLDS ──
CREATE TABLE IF NOT EXISTS evaluation_team_thresholds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES evaluation_sessions(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams(id),
  min_score numeric NOT NULL,
  max_roster int,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(session_id, team_id)
);

-- ── 26. SEASON EVALUATIONS ──
CREATE TABLE IF NOT EXISTS season_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams(id),
  season_id text NOT NULL REFERENCES seasons(id),
  team_season_id uuid REFERENCES team_seasons(id),
  evaluator_id uuid NOT NULL,
  ratings jsonb NOT NULL DEFAULT '{}',
  notes text,
  overall_rating numeric,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(player_id, team_id, season_id, evaluator_id)
);

-- ── 27. AUDIT LOG ──
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid,
  action text NOT NULL,
  changed_by uuid NOT NULL,
  old_data jsonb,
  new_data jsonb,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);


-- ============================================================
-- VIEWS
-- ============================================================

-- Player Financials (single source of truth for balances)
CREATE OR REPLACE VIEW player_financials AS
SELECT
  ps.player_id,
  ps.season_id,
  ps.team_season_id,
  ps.fee_waived,
  CASE
    WHEN ps.fee_waived THEN 0
    ELSE COALESCE(
      ceil((
        (ts.total_projected_expenses * (1 + ts.buffer_percent / 100.0))
        / NULLIF(ts.expected_roster_size, 0)
      ) / 50) * 50, 0)
  END AS base_fee,
  COALESCE(sum(t.amount) FILTER (WHERE t.category = 'TMF' AND t.cleared), 0) AS total_paid,
  COALESCE(sum(t.amount) FILTER (WHERE t.category = 'FUN' AND t.cleared AND (t.distributed OR t.waterfall_batch_id IS NOT NULL)), 0) AS fundraising,
  COALESCE(sum(t.amount) FILTER (WHERE t.category = 'SPO' AND t.cleared AND (t.distributed OR t.waterfall_batch_id IS NOT NULL)), 0) AS sponsorships,
  COALESCE(sum(t.amount) FILTER (WHERE t.category = 'CRE' AND t.cleared), 0) AS credits,
  GREATEST(0,
    CASE WHEN ps.fee_waived THEN 0
    ELSE COALESCE(
      ceil((
        (ts.total_projected_expenses * (1 + ts.buffer_percent / 100.0))
        / NULLIF(ts.expected_roster_size, 0)
      ) / 50) * 50, 0)
    END
    - COALESCE(sum(t.amount) FILTER (WHERE t.category = 'TMF' AND t.cleared), 0)
    - COALESCE(sum(t.amount) FILTER (WHERE t.category = 'FUN' AND t.cleared AND (t.distributed OR t.waterfall_batch_id IS NOT NULL)), 0)
    - COALESCE(sum(t.amount) FILTER (WHERE t.category = 'SPO' AND t.cleared AND (t.distributed OR t.waterfall_batch_id IS NOT NULL)), 0)
    - COALESCE(sum(t.amount) FILTER (WHERE t.category = 'CRE' AND t.cleared), 0)
  ) AS remaining_balance
FROM player_seasons ps
LEFT JOIN team_seasons ts ON ts.id = ps.team_season_id
LEFT JOIN transactions t ON t.player_id = ps.player_id AND t.season_id = ps.season_id
GROUP BY ps.player_id, ps.season_id, ps.team_season_id, ps.fee_waived,
         ts.total_projected_expenses, ts.buffer_percent, ts.expected_roster_size;

-- Seasonal Roster
CREATE OR REPLACE VIEW seasonal_roster AS
SELECT
  p.id, p.first_name, p.last_name, p.jersey_number, p.birthdate, p.gender,
  p.status AS player_status, p.medical_release, p.reeplayer_waiver,
  p.club_id, p.team_id,
  ps.id AS season_profile_id, ps.season_id, ps.team_season_id,
  ps.fee_waived, ps.fundraiser_buyin, ps.status AS season_status
FROM players p
JOIN player_seasons ps ON p.id = ps.player_id;

-- Evaluation Candidate Scores (aggregated across evaluators)
CREATE OR REPLACE VIEW evaluation_candidate_scores AS
SELECT
  ec.id AS candidate_id,
  ec.session_id,
  cat.id AS category_id,
  cat.name AS category_name,
  cat.weight,
  es_agg.score_scale,
  COALESCE(AVG(es.score), 0) AS avg_score,
  COUNT(DISTINCT es.evaluator_id) AS evaluator_count
FROM evaluation_candidates ec
JOIN evaluation_categories cat ON cat.session_id = ec.session_id
JOIN evaluation_sessions es_agg ON es_agg.id = ec.session_id
LEFT JOIN evaluation_scores es ON es.candidate_id = ec.id AND es.category_id = cat.id
GROUP BY ec.id, ec.session_id, cat.id, cat.name, cat.weight, es_agg.score_scale;


-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_players_club ON players(club_id);
CREATE INDEX IF NOT EXISTS idx_players_team ON players(team_id);
CREATE INDEX IF NOT EXISTS idx_guardians_player ON guardians(player_id);
CREATE INDEX IF NOT EXISTS idx_guardians_email ON guardians(email);
CREATE INDEX IF NOT EXISTS idx_transactions_season ON transactions(season_id);
CREATE INDEX IF NOT EXISTS idx_transactions_team_season ON transactions(team_season_id);
CREATE INDEX IF NOT EXISTS idx_transactions_player ON transactions(player_id);
CREATE INDEX IF NOT EXISTS idx_player_seasons_player ON player_seasons(player_id);
CREATE INDEX IF NOT EXISTS idx_player_seasons_season ON player_seasons(season_id);
CREATE INDEX IF NOT EXISTS idx_team_seasons_team ON team_seasons(team_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_club ON user_roles(club_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_team ON user_roles(team_id);
CREATE INDEX IF NOT EXISTS idx_documents_player ON documents(player_id);
CREATE INDEX IF NOT EXISTS idx_documents_club ON documents(club_id);
CREATE INDEX IF NOT EXISTS idx_team_events_team ON team_events(team_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_table ON audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_log_record ON audit_log(record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(changed_by);
CREATE INDEX IF NOT EXISTS idx_eval_sessions_club ON evaluation_sessions(club_id);
CREATE INDEX IF NOT EXISTS idx_eval_candidates_session ON evaluation_candidates(session_id);
CREATE INDEX IF NOT EXISTS idx_eval_scores_candidate ON evaluation_scores(candidate_id);
CREATE INDEX IF NOT EXISTS idx_eval_scores_evaluator ON evaluation_scores(evaluator_id);
CREATE INDEX IF NOT EXISTS idx_eval_thresholds_session ON evaluation_team_thresholds(session_id);
CREATE INDEX IF NOT EXISTS idx_season_eval_player ON season_evaluations(player_id);
CREATE INDEX IF NOT EXISTS idx_season_eval_team_season ON season_evaluations(team_id, season_id);


-- ============================================================
-- ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- ============================================================
ALTER TABLE clubs ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_seasons ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_amendments ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE blackouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE changelogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_evaluators ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_team_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE season_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- SUPABASE STORAGE BUCKET
-- ============================================================
-- Create via Supabase Dashboard → Storage → New Bucket:
--   Name: player-documents
--   Public: false
--   File size limit: 10MB
--   Allowed MIME types: application/pdf, image/jpeg, image/png, image/gif,
--     application/msword, application/vnd.openxmlformats-officedocument.wordprocessingml.document


-- ============================================================
-- SEED: Default season
-- ============================================================
INSERT INTO seasons (id, name) VALUES ('2025-2026', '2025-2026 Season')
ON CONFLICT (id) DO NOTHING;
INSERT INTO seasons (id, name) VALUES ('2024-2025', '2024-2025 Season')
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- NEXT STEPS:
-- 1. Run sql/rls_policies.sql to apply proper RLS policies
-- 2. Create a storage bucket named 'player-documents' in the dashboard
-- 3. Sign up a user and assign super_admin role:
--    INSERT INTO user_roles (user_id, role)
--    SELECT id, 'super_admin' FROM auth.users WHERE email = 'YOUR_EMAIL';
-- ============================================================
