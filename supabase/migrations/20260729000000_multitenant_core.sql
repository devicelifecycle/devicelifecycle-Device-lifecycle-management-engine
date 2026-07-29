-- ============================================================================
-- MULTI-TENANT CORE (Phase 1 of the VAR platform re-architecture)
-- 2026-07-29
--
-- Introduces the VAR/tenant layer using the shared-DB + tenant_id model
-- (Option A). Fully ADDITIVE: existing data is backfilled into a single
-- "Byte-Back" platform tenant, and every tenant-scoped table gets a tenant_id
-- that DEFAULTS to that tenant — so existing app inserts (which don't set
-- tenant_id yet) keep working unchanged. Tenant-aware code + RLS scoping land
-- in the following steps.
--
-- Pricing / catalog / ML / system tables stay PLATFORM-GLOBAL (BB Admin owns
-- pricing per the outline) and deliberately get no tenant_id.
-- ============================================================================

-- ── 1. Tenants (VARs) — supports N-level hierarchy (Appendix A) ──────────────
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_tenant_id UUID REFERENCES tenants(id),   -- Program → Entity → Regional → Rep
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,               -- subdomain / white-label key
  type VARCHAR(30) NOT NULL DEFAULT 'var',         -- 'platform' | 'var'
  is_active BOOLEAN NOT NULL DEFAULT true,
  branding JSONB NOT NULL DEFAULT '{}',            -- Phase 3: logo, colors, domain
  custom_domain VARCHAR(255),
  settings JSONB NOT NULL DEFAULT '{}',            -- Phase 4: commission/margin model
  plan VARCHAR(50),                                -- licensing / subscription
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tenants_parent ON tenants (parent_tenant_id);

-- ── 2. Seed the root Byte-Back platform tenant (fixed id for backfill) ───────
INSERT INTO tenants (id, name, slug, type, is_active)
VALUES ('a0000000-0000-4000-a000-0000000000bb', 'Byte-Back', 'byte-back', 'platform', true)
ON CONFLICT (id) DO NOTHING;

-- ── 3. Add tenant_id (default = Byte-Back) to every tenant-scoped table ──────
-- DEFAULT + Postgres fast-default backfills existing rows automatically and
-- keeps current inserts working until the app sets tenant_id explicitly.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'users','organizations','customers','vendors',
    'orders','order_items','order_exceptions','order_splits','order_timeline',
    'imei_records','triage_results','shipments','vendor_bids',
    'notifications','notification_attempts','nps_responses',
    'recurring_trade_in_schedules','audit_logs','sla_breaches','sales_history'
  ] LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN IF NOT EXISTS tenant_id UUID NOT NULL DEFAULT %L REFERENCES tenants(id)',
      t, 'a0000000-0000-4000-a000-0000000000bb'
    );
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_tenant_id ON %I (tenant_id)', t, t);
  END LOOP;
END $$;

-- ── 4. Helper for RLS: the current auth user's tenant ───────────────────────
CREATE OR REPLACE FUNCTION auth_tenant_id() RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tenant_id FROM users WHERE id = auth.uid()
$$;

-- ── 5. Minimal RLS on tenants (refined in the RLS-scoping step) ──────────────
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenants_select_own ON tenants;
CREATE POLICY tenants_select_own ON tenants FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR id = auth_tenant_id()
    OR is_admin()  -- platform admins see all tenants
  );
