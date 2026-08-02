-- ============================================================================
-- API KEYS (backend for integrations)
-- 2026-08-08
--
-- Stores only a SHA-256 hash + a short display prefix — never the secret.
-- Tenant-scoped; admin/service manage, a tenant may read its own (prefix only).
-- ============================================================================

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) DEFAULT 'a0000000-0000-4000-a000-0000000000bb',
  name VARCHAR(100) NOT NULL,
  key_prefix VARCHAR(20) NOT NULL,
  key_hash VARCHAR(64) UNIQUE NOT NULL,
  created_by UUID REFERENCES users(id),
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON api_keys(tenant_id);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS api_keys_admin_all ON api_keys;
CREATE POLICY api_keys_admin_all ON api_keys FOR ALL
  USING (auth.role() = 'service_role' OR is_admin())
  WITH CHECK (auth.role() = 'service_role' OR is_admin());

DROP POLICY IF EXISTS api_keys_tenant_read ON api_keys;
CREATE POLICY api_keys_tenant_read ON api_keys FOR SELECT
  USING (tenant_id = auth_tenant_id());
