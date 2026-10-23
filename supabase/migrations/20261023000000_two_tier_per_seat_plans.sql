-- ============================================================================
-- Restructure plans: three-tier flat -> two-tier per-seat ($40/$70 CAD)
-- ============================================================================
-- Individual ($40/seat/mo) = platform-branded, no white-label
-- Enterprise ($70/seat/mo) = white-labeled with custom domain & branding

-- Retire old tiers (keep rows for any existing tenants still referencing them)
UPDATE subscription_plans SET is_active = false
WHERE slug IN ('essentials', 'professional')
  AND is_active = true;

-- Upsert Individual plan
INSERT INTO subscription_plans (name, slug, monthly_price, currency, limits, features, is_active)
VALUES (
  'Individual',
  'individual',
  40,
  'CAD',
  '{"customers": 500, "users": 50, "storageMb": 50000, "apiCallsPerMonth": 0, "transactionsPerMonth": 2500}'::jsonb,
  '{"trade_in": true, "cpo": true, "rve": true, "billing": true, "reporting": true, "notifications": true, "knowledge_base": true, "chat": true, "impersonation": true}'::jsonb,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  monthly_price = EXCLUDED.monthly_price,
  limits = EXCLUDED.limits,
  features = EXCLUDED.features,
  is_active = true;

-- Upsert Enterprise plan
INSERT INTO subscription_plans (name, slug, monthly_price, currency, limits, features, is_active)
VALUES (
  'Enterprise',
  'enterprise',
  70,
  'CAD',
  '{"customers": -1, "users": -1, "storageMb": -1, "apiCallsPerMonth": 1000000, "transactionsPerMonth": -1}'::jsonb,
  '{"trade_in": true, "cpo": true, "rve": true, "billing": true, "reporting": true, "notifications": true, "knowledge_base": true, "chat": true, "impersonation": true, "api_access": true, "white_label": true}'::jsonb,
  true
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  monthly_price = EXCLUDED.monthly_price,
  limits = EXCLUDED.limits,
  features = EXCLUDED.features,
  is_active = true;

-- Migrate any tenants on old plans to individual
UPDATE tenants SET plan = 'individual'
WHERE plan IN ('essentials', 'professional');
