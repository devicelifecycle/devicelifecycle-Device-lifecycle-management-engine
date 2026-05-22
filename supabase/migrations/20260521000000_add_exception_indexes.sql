-- ============================================================================
-- ADD INDEXES FOR EXCEPTION QUERY FIELDS
-- triage_results.approval_status and mismatch_severity are queried heavily
-- by the exception dashboard and reconciliation report but have no indexes.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_triage_approval_status
  ON triage_results(approval_status)
  WHERE approval_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_triage_mismatch_severity
  ON triage_results(mismatch_severity)
  WHERE mismatch_severity IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_triage_exception_type
  ON triage_results(exception_type)
  WHERE exception_type IS NOT NULL;
