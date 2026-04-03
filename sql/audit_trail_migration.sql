-- Audit trail for financial operations
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid,
  action text NOT NULL, -- insert, update, delete
  changed_by uuid NOT NULL,
  old_data jsonb,
  new_data jsonb,
  metadata jsonb, -- extra context (season_id, team_id, etc.)
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_table ON audit_log(table_name);
CREATE INDEX idx_audit_log_record ON audit_log(record_id);
CREATE INDEX idx_audit_log_user ON audit_log(changed_by);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_select" ON audit_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "audit_log_insert" ON audit_log FOR INSERT TO authenticated WITH CHECK (true);
