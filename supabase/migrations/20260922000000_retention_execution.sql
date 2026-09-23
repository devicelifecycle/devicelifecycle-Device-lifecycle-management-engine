-- ============================================================================
-- DATA RETENTION — EXECUTION (bounded deletes + per-run audit)
-- ============================================================================
-- Stage 2 of the retention work. Stage 1 (20260919…) gave each tenant a policy
-- and a dry-run report; this deletes for real, on a live system with live data,
-- so every safety property here is deliberate:
--
--   * Allowlist INSIDE the function. p_table is checked against a fixed list of
--     six operational-exhaust tables before any dynamic SQL is built. A caller
--     cannot aim this at orders, customers, invoices or users no matter what it
--     passes — the function raises instead.
--   * Bounded. Every call deletes at most p_limit rows (hard-capped at 50k),
--     chosen by primary key from a subquery, so one bad policy cannot take the
--     database down in a single statement. The caller loops until a batch comes
--     back short, and stops at its own per-run ceiling.
--   * Tenant-scoped. Deletes are always filtered by tenant_id, so one tenant's
--     policy can never reach another's rows.
--   * Auditable. retention_runs records every batch: tenant, class, cutoff,
--     rows removed, who/what triggered it, and any error.
--   * Inert by default. A tenant with no policy has NULL days and is skipped
--     entirely by the caller — nothing is deleted anywhere until an operator
--     sets a number.

CREATE TABLE IF NOT EXISTS retention_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID REFERENCES tenants(id) ON DELETE SET NULL,
  data_class   TEXT NOT NULL,
  cutoff       TIMESTAMPTZ NOT NULL,
  days_kept    INTEGER NOT NULL,
  rows_deleted BIGINT NOT NULL DEFAULT 0,
  triggered_by TEXT NOT NULL DEFAULT 'cron',
  error        TEXT,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_retention_runs_tenant_started ON retention_runs(tenant_id, started_at DESC);

-- Service role only; the admin UI reads it through the service-role client.
ALTER TABLE retention_runs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION retention_delete_batch(
  p_table     TEXT,
  p_ts_column TEXT,
  p_tenant_id UUID,
  p_cutoff    TIMESTAMPTZ,
  p_limit     INTEGER
) RETURNS BIGINT
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  deleted BIGINT;
  capped  INTEGER := LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 50000);
BEGIN
  -- Allowlist: table AND its timestamp column, as one pair. Anything else is
  -- a bug or an attack; either way it must not run.
  IF (p_table, p_ts_column) NOT IN (
    ('audit_logs', 'timestamp'),
    ('notifications', 'created_at'),
    ('notification_attempts', 'created_at'),
    ('order_timeline', 'created_at'),
    ('sla_breaches', 'created_at'),
    ('impersonation_log', 'ended_at')
  ) THEN
    RAISE EXCEPTION 'retention_delete_batch: % / % is not a retention target', p_table, p_ts_column;
  END IF;

  IF p_tenant_id IS NULL OR p_cutoff IS NULL THEN
    RAISE EXCEPTION 'retention_delete_batch: tenant_id and cutoff are required';
  END IF;

  EXECUTE format(
    'WITH doomed AS (
       SELECT id FROM %I
       WHERE tenant_id = $1 AND %I IS NOT NULL AND %I < $2
       ORDER BY %I
       LIMIT %s
     )
     DELETE FROM %I t USING doomed d WHERE t.id = d.id',
    p_table, p_ts_column, p_ts_column, p_ts_column, capped, p_table
  ) USING p_tenant_id, p_cutoff;

  GET DIAGNOSTICS deleted = ROW_COUNT;
  RETURN deleted;
END;
$$;

REVOKE ALL ON FUNCTION retention_delete_batch(TEXT, TEXT, UUID, TIMESTAMPTZ, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION retention_delete_batch(TEXT, TEXT, UUID, TIMESTAMPTZ, INTEGER) TO service_role;
