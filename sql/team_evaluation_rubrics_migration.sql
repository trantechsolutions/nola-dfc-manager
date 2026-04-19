-- Team Evaluation Rubrics: per-team custom rubric for season evaluations.
-- One active rubric per team. If no row exists, app falls back to the default rubric.
CREATE TABLE IF NOT EXISTS team_evaluation_rubrics (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid NOT NULL UNIQUE REFERENCES teams(id) ON DELETE CASCADE,
  sections    jsonb NOT NULL DEFAULT '[]',
  -- sections shape:
  -- [
  --   { "key": "technical", "label": "Technical", "groups": [
  --       { "key": "passing", "label": "Passing", "skills": [
  --           { "key": "passing_pace", "label": "Proper Pace" }
  --       ]}
  --   ]}
  -- ]
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid
);

ALTER TABLE team_evaluation_rubrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team_rubric_select" ON team_evaluation_rubrics FOR SELECT TO authenticated USING (true);
CREATE POLICY "team_rubric_insert" ON team_evaluation_rubrics FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "team_rubric_update" ON team_evaluation_rubrics FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "team_rubric_delete" ON team_evaluation_rubrics FOR DELETE TO authenticated USING (true);
