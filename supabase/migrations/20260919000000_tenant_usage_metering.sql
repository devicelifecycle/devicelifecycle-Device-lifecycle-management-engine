-- ============================================================================
-- TENANT USAGE METERING — API calls, AI tokens (counters) + storage (measured)
-- ============================================================================
-- The outline asks for storage quotas and Storage / API usage reporting under
-- BB Admin. The license model already carried `storageMb` and
-- `apiCallsPerMonth` limits with nothing feeding them, and the platform report
-- showed "Not yet metered". This is the runtime source.
--
-- Two different mechanisms on purpose:
--   * API calls and AI tokens are EVENTS — counted as they happen into one row
--     per tenant per day (atomic upsert, no read-modify-write race).
--   * Storage is a STATE — measured from storage.objects at read time, so
--     re-uploads (the order-file route uses upsert:true) and deletes can never
--     drift a counter. Files live under customer-orders/{organization_id}/…
--     and organizations carry tenant_id, so the join is exact.

CREATE TABLE IF NOT EXISTS tenant_usage_daily (
  tenant_id  UUID   NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  day        DATE   NOT NULL,
  api_calls  BIGINT NOT NULL DEFAULT 0,
  ai_tokens  BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, day)
);

-- Service role only: no policies, RLS on. The app writes through the RPC and
-- reads with the service-role client; no browser client ever touches this.
ALTER TABLE tenant_usage_daily ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION increment_tenant_usage(
  p_tenant_id UUID,
  p_api_calls INTEGER DEFAULT 0,
  p_ai_tokens INTEGER DEFAULT 0
) RETURNS VOID
LANGUAGE sql
SECURITY INVOKER
AS $$
  INSERT INTO tenant_usage_daily (tenant_id, day, api_calls, ai_tokens)
  VALUES (p_tenant_id, (NOW() AT TIME ZONE 'UTC')::date, GREATEST(p_api_calls, 0), GREATEST(p_ai_tokens, 0))
  ON CONFLICT (tenant_id, day) DO UPDATE SET
    api_calls  = tenant_usage_daily.api_calls + EXCLUDED.api_calls,
    ai_tokens  = tenant_usage_daily.ai_tokens + EXCLUDED.ai_tokens,
    updated_at = NOW();
$$;

REVOKE ALL ON FUNCTION increment_tenant_usage(UUID, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION increment_tenant_usage(UUID, INTEGER, INTEGER) TO service_role;

-- Month-to-date rollup, one row per tenant that has any usage.
CREATE OR REPLACE FUNCTION tenant_usage_month(p_month_start DATE DEFAULT date_trunc('month', (NOW() AT TIME ZONE 'UTC'))::date)
RETURNS TABLE (tenant_id UUID, api_calls BIGINT, ai_tokens BIGINT)
LANGUAGE sql
SECURITY INVOKER
STABLE
AS $$
  SELECT tenant_id, SUM(api_calls)::bigint, SUM(ai_tokens)::bigint
  FROM tenant_usage_daily
  WHERE day >= p_month_start AND day < (p_month_start + INTERVAL '1 month')::date
  GROUP BY tenant_id;
$$;

REVOKE ALL ON FUNCTION tenant_usage_month(DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tenant_usage_month(DATE) TO service_role;

-- Bytes held in the `uploads` bucket per tenant, measured from storage.objects.
-- SECURITY DEFINER because storage.objects is not readable through PostgREST;
-- execution is restricted to service_role so nothing else can call it.
CREATE OR REPLACE FUNCTION tenant_storage_bytes()
RETURNS TABLE (tenant_id UUID, bytes BIGINT, objects BIGINT)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, storage
STABLE
AS $$
  SELECT o.tenant_id,
         COALESCE(SUM((so.metadata->>'size')::bigint), 0)::bigint AS bytes,
         COUNT(*)::bigint AS objects
  FROM storage.objects so
  JOIN organizations o
    ON so.bucket_id = 'uploads'
   AND split_part(so.name, '/', 1) = 'customer-orders'
   AND split_part(so.name, '/', 2) = o.id::text
  GROUP BY o.tenant_id;
$$;

REVOKE ALL ON FUNCTION tenant_storage_bytes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tenant_storage_bytes() TO service_role;
