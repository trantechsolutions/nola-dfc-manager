-- ============================================================
-- Player Evaluation System — Database Migration
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Evaluation Sessions (tryout events)
CREATE TABLE IF NOT EXISTS evaluation_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id     uuid NOT NULL REFERENCES clubs(id),
  season_id   text REFERENCES seasons(id),
  name        text NOT NULL,
  description text,
  status      text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'completed')),
  score_scale int NOT NULL DEFAULT 5
    CHECK (score_scale IN (5, 10)),
  created_by  uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 2. Evaluation Categories (scoring rubric per session)
CREATE TABLE IF NOT EXISTS evaluation_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES evaluation_sessions(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  weight      numeric NOT NULL DEFAULT 1,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- 3. Evaluation Candidates (players being evaluated)
CREATE TABLE IF NOT EXISTS evaluation_candidates (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       uuid NOT NULL REFERENCES evaluation_sessions(id) ON DELETE CASCADE,
  player_id        uuid REFERENCES players(id),
  first_name       text NOT NULL,
  last_name        text NOT NULL,
  bib_number       int,                         -- visible identifier during evaluations
  birthdate        date,
  gender           text,                         -- boys / girls
  age_group        text,
  position         text,
  notes            text,
  overall_score    numeric,
  placed_team_id   uuid REFERENCES teams(id),
  placement_status text NOT NULL DEFAULT 'pending'
    CHECK (placement_status IN ('pending', 'placed', 'declined', 'waitlist')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- 4. Evaluation Scores (per evaluator × candidate × category)
CREATE TABLE IF NOT EXISTS evaluation_scores (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id  uuid NOT NULL REFERENCES evaluation_candidates(id) ON DELETE CASCADE,
  category_id   uuid NOT NULL REFERENCES evaluation_categories(id) ON DELETE CASCADE,
  evaluator_id  uuid NOT NULL,
  score         numeric NOT NULL,
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(candidate_id, category_id, evaluator_id)
);

-- 5. Evaluation Evaluators (assigned evaluators per session)
CREATE TABLE IF NOT EXISTS evaluation_evaluators (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid NOT NULL REFERENCES evaluation_sessions(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL,
  display_name text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, user_id)
);

-- 6. Evaluation Team Thresholds (min score per team for auto-placement)
CREATE TABLE IF NOT EXISTS evaluation_team_thresholds (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  uuid NOT NULL REFERENCES evaluation_sessions(id) ON DELETE CASCADE,
  team_id     uuid NOT NULL REFERENCES teams(id),
  min_score   numeric NOT NULL,
  max_roster  int,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(session_id, team_id)
);

-- ============================================================
-- View: Aggregated candidate scores (avg across evaluators)
-- ============================================================
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
-- RLS Policies
-- ============================================================
ALTER TABLE evaluation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_evaluators ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_team_thresholds ENABLE ROW LEVEL SECURITY;

-- Read access for authenticated users
CREATE POLICY "eval_sessions_select" ON evaluation_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "eval_categories_select" ON evaluation_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "eval_candidates_select" ON evaluation_candidates FOR SELECT TO authenticated USING (true);
CREATE POLICY "eval_scores_select" ON evaluation_scores FOR SELECT TO authenticated USING (true);
CREATE POLICY "eval_evaluators_select" ON evaluation_evaluators FOR SELECT TO authenticated USING (true);
CREATE POLICY "eval_thresholds_select" ON evaluation_team_thresholds FOR SELECT TO authenticated USING (true);

-- Write access for authenticated users (app enforces role checks)
CREATE POLICY "eval_sessions_insert" ON evaluation_sessions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "eval_sessions_update" ON evaluation_sessions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "eval_sessions_delete" ON evaluation_sessions FOR DELETE TO authenticated USING (true);

CREATE POLICY "eval_categories_insert" ON evaluation_categories FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "eval_categories_update" ON evaluation_categories FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "eval_categories_delete" ON evaluation_categories FOR DELETE TO authenticated USING (true);

CREATE POLICY "eval_candidates_insert" ON evaluation_candidates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "eval_candidates_update" ON evaluation_candidates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "eval_candidates_delete" ON evaluation_candidates FOR DELETE TO authenticated USING (true);

CREATE POLICY "eval_scores_insert" ON evaluation_scores FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "eval_scores_update" ON evaluation_scores FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "eval_scores_delete" ON evaluation_scores FOR DELETE TO authenticated USING (true);

CREATE POLICY "eval_evaluators_insert" ON evaluation_evaluators FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "eval_evaluators_update" ON evaluation_evaluators FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "eval_evaluators_delete" ON evaluation_evaluators FOR DELETE TO authenticated USING (true);

CREATE POLICY "eval_thresholds_insert" ON evaluation_team_thresholds FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "eval_thresholds_update" ON evaluation_team_thresholds FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "eval_thresholds_delete" ON evaluation_team_thresholds FOR DELETE TO authenticated USING (true);

-- ============================================================
-- Indexes for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_eval_sessions_club ON evaluation_sessions(club_id);
CREATE INDEX IF NOT EXISTS idx_eval_candidates_session ON evaluation_candidates(session_id);
CREATE INDEX IF NOT EXISTS idx_eval_scores_candidate ON evaluation_scores(candidate_id);
CREATE INDEX IF NOT EXISTS idx_eval_scores_evaluator ON evaluation_scores(evaluator_id);
CREATE INDEX IF NOT EXISTS idx_eval_thresholds_session ON evaluation_team_thresholds(session_id);
