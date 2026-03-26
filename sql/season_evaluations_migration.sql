-- Season Evaluations: coach evaluations of roster players at end of season
CREATE TABLE IF NOT EXISTS season_evaluations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id       uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  team_id         uuid NOT NULL REFERENCES teams(id),
  season_id       text NOT NULL REFERENCES seasons(id),
  team_season_id  uuid REFERENCES team_seasons(id),
  evaluator_id    uuid NOT NULL,
  ratings         jsonb NOT NULL DEFAULT '{}',   -- { technical: 2, tactical: 1, ... }
  notes           text,
  overall_rating  numeric,                       -- computed average (1-4 scale, 1=best)
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(player_id, team_id, season_id, evaluator_id)
);

-- RLS
ALTER TABLE season_evaluations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "season_eval_select" ON season_evaluations FOR SELECT TO authenticated USING (true);
CREATE POLICY "season_eval_insert" ON season_evaluations FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "season_eval_update" ON season_evaluations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "season_eval_delete" ON season_evaluations FOR DELETE TO authenticated USING (true);

-- Index
CREATE INDEX IF NOT EXISTS idx_season_eval_player ON season_evaluations(player_id);
CREATE INDEX IF NOT EXISTS idx_season_eval_team_season ON season_evaluations(team_id, season_id);
