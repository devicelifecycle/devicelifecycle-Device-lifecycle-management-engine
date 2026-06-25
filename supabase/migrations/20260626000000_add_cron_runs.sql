-- ============================================================================
-- CRON RUN OBSERVABILITY
-- ============================================================================
-- audit_logs isn't a good fit for "did this cron run and did it succeed" —
-- entity_id is NOT NULL with no FK, designed for a specific record being
-- changed, and audit_action's enum has no value for a batch job running.
-- Cron failures were previously invisible until a downstream symptom
-- appeared (stale prices, missed SLA, etc.) — found during a platform audit
-- that 14 of 15 scheduled cron jobs had zero observability into success/
-- failure beyond Vercel's own ephemeral function logs.
-- ============================================================================

CREATE TABLE cron_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cron_name VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failure')),
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ NOT NULL,
  error_message TEXT,
  stats JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_cron_runs_name_started ON cron_runs(cron_name, started_at DESC);
CREATE INDEX idx_cron_runs_status ON cron_runs(status) WHERE status = 'failure';

ALTER TABLE cron_runs ENABLE ROW LEVEL SECURITY;

-- Only admins can read cron history; writes happen exclusively via the
-- service-role client from within the cron routes themselves.
CREATE POLICY "Admins can view cron runs" ON cron_runs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'admin'
    )
  );
