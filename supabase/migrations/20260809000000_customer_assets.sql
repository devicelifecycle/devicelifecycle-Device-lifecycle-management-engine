-- ============================================================================
-- CUSTOMER ASSET REGISTER (End Customer console)
-- 2026-08-09
--
-- A customer's own device/asset list. Tenant-scoped; additive.
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) DEFAULT 'a0000000-0000-4000-a000-0000000000bb',
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  device_id UUID REFERENCES device_catalog(id),
  label VARCHAR(200) NOT NULL,
  serial_number VARCHAR(120),
  status VARCHAR(12) NOT NULL DEFAULT 'registered'
    CHECK (status IN ('registered','assigned','retired')),
  assigned_to VARCHAR(160),
  location VARCHAR(160),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customer_assets_tenant ON customer_assets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customer_assets_customer ON customer_assets(customer_id);

ALTER TABLE customer_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_assets_rw ON customer_assets;
CREATE POLICY customer_assets_rw ON customer_assets FOR ALL
  USING (auth.role() = 'service_role' OR is_admin() OR tenant_id = auth_tenant_id())
  WITH CHECK (auth.role() = 'service_role' OR is_admin() OR tenant_id = auth_tenant_id());
