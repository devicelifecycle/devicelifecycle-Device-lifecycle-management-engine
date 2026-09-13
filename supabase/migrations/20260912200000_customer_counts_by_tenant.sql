-- ============================================================================
-- CUSTOMER COUNTS BY TENANT — one grouped aggregate instead of an N+1
-- 2026-09-12
--
-- The admin operations report issued one COUNT(*) per active VAR to build its
-- per-VAR licence table, so a platform with a few hundred VARs fired a few
-- hundred round trips on a single page load. This returns the same numbers in
-- one query. Additive: new function only, no schema or data changes.
-- ============================================================================

CREATE OR REPLACE FUNCTION customer_counts_by_tenant(p_tenant_ids UUID[])
RETURNS TABLE (tenant_id UUID, customer_count BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT c.tenant_id, COUNT(*)::BIGINT AS customer_count
  FROM customers c
  WHERE c.tenant_id = ANY(p_tenant_ids)
  GROUP BY c.tenant_id;
$$;
