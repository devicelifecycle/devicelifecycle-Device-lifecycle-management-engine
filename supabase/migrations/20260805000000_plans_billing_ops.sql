-- ============================================================================
-- SUBSCRIPTION PLANS + BILLING OPERATIONS (R1)
-- 2026-08-05
--
-- Additive. Plans catalog + a couple of columns on invoices (kind, credit) to
-- distinguish CPO invoices from trade-in POs and to record credits/adjustments.
-- Nothing existing depends on these.
-- ============================================================================

CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(60) UNIQUE NOT NULL,
  monthly_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'CAD',
  limits JSONB NOT NULL DEFAULT '{}',
  features JSONB NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO subscription_plans (name, slug, monthly_price, limits, features) VALUES
  ('Starter',    'starter',    99,  '{"customers":100,"users":10}',                  '{"api_access":false,"sso":false}'),
  ('Growth',     'growth',     299, '{"customers":1000,"users":50}',                 '{"api_access":true,"sso":false}'),
  ('Enterprise', 'enterprise', 999, '{"customers":-1,"users":-1,"storageMb":-1}',    '{"api_access":true,"sso":true,"vendor_auction":true}')
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS kind VARCHAR(10) NOT NULL DEFAULT 'invoice'
    CHECK (kind IN ('invoice','po')),          -- CPO -> invoice (VAR pays BB); trade-in -> po (BB pays VAR)
  ADD COLUMN IF NOT EXISTS credit NUMERIC(12,2) NOT NULL DEFAULT 0;

-- ── RLS: catalog readable by any authed user; writable by admin/service ──────
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plans_read ON subscription_plans;
CREATE POLICY plans_read ON subscription_plans FOR SELECT
  USING (auth.role() = 'service_role' OR auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS plans_admin_write ON subscription_plans;
CREATE POLICY plans_admin_write ON subscription_plans FOR ALL
  USING (auth.role() = 'service_role' OR is_admin())
  WITH CHECK (auth.role() = 'service_role' OR is_admin());
