-- ============================================================================
-- Customer asset AUDIT — append-only per-asset change history
-- (outline: Customer Devices/Assets → 'audit').
-- Written by the assets API after each mutation;
-- read by GET /api/customer/assets/[id]/events.
--
-- Tenant column types mirror customer_assets (20260809000000): uuid tenant_id,
-- default platform tenant 'a0000000-0000-4000-a000-0000000000bb'.
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_asset_events (
  id BIGSERIAL PRIMARY KEY,
  asset_id UUID NOT NULL REFERENCES customer_assets(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id),
  tenant_id UUID NOT NULL DEFAULT 'a0000000-0000-4000-a000-0000000000bb',
  event_type TEXT NOT NULL
    CHECK (event_type IN ('registered','assigned','unassigned','retired','restored','moved','updated')),
  details JSONB,
  actor_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customer_asset_events_asset_created
  ON customer_asset_events(asset_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_customer_asset_events_org_created
  ON customer_asset_events(organization_id, created_at DESC);

ALTER TABLE customer_asset_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_asset_events_select ON customer_asset_events;
CREATE POLICY customer_asset_events_select ON customer_asset_events FOR SELECT
  USING (auth.role() = 'service_role' OR is_admin() OR tenant_id = auth_tenant_id());

DROP POLICY IF EXISTS customer_asset_events_insert ON customer_asset_events;
CREATE POLICY customer_asset_events_insert ON customer_asset_events FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR (auth.role() = 'authenticated' AND tenant_id = auth_tenant_id())
  );

-- Append-only: intentionally no UPDATE or DELETE policies.