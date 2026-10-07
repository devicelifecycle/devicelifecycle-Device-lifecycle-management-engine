-- ============================================================================
-- SUBSCRIPTION TIERS — align subscription_plans with the three-tier model
-- ============================================================================
-- The platform is being sold as a SaaS subscription in three tiers
-- (src/lib/plan-tiers.ts is the source of truth; the client approval document
-- is docs/CLIENT_APPROVAL_SUBSCRIPTION_MODEL.md).
--
-- The three seeded plans (starter $99 / growth $299 / enterprise $999) were
-- placeholders with no feature or limit content — `features` and `limits` were
-- empty, so every plan actually granted the same thing. This replaces them
-- with the real tier definitions.
--
-- PRICING IS SET TO NULL ON PURPOSE: not yet approved by the client. NULL is
-- not 0 — a 0 would read as "free" and bill nobody while looking deliberate.
-- The UI renders NULL as "Price to be confirmed".
--
-- Safe to re-slug: verified before writing that exactly one tenant exists
-- (the platform tenant) and its `plan` is NULL, so nothing references the old
-- slugs. `tenants.plan` joins on slug, so this would orphan assignments if any
-- existed — hence the guard below, which aborts rather than silently orphaning.

DO $$
DECLARE
  assigned INT;
BEGIN
  SELECT COUNT(*) INTO assigned
  FROM tenants
  WHERE plan IS NOT NULL AND plan IN ('starter', 'growth');

  IF assigned > 0 THEN
    RAISE EXCEPTION
      'Refusing to re-slug plans: % tenant(s) are assigned to starter/growth. Migrate them first.',
      assigned;
  END IF;
END $$;

-- Allow "price not yet decided" to be representable.
ALTER TABLE subscription_plans ALTER COLUMN monthly_price DROP NOT NULL;

-- Old placeholder tiers that nothing points at.
DELETE FROM subscription_plans WHERE slug IN ('starter', 'growth');

INSERT INTO subscription_plans (slug, name, monthly_price, currency, features, limits, is_active)
VALUES
  (
    'essentials', 'Essentials', NULL, 'CAD',
    '{"trade_in": true, "cpo": true, "notifications": true, "knowledge_base": true}'::jsonb,
    '{"customers": 50, "users": 10, "storageMb": 5000, "apiCallsPerMonth": 0, "transactionsPerMonth": 250}'::jsonb,
    true
  ),
  (
    'professional', 'Professional', NULL, 'CAD',
    '{"trade_in": true, "cpo": true, "notifications": true, "knowledge_base": true, "rve": true, "reporting": true, "chat": true, "billing": true}'::jsonb,
    '{"customers": 500, "users": 50, "storageMb": 50000, "apiCallsPerMonth": 0, "transactionsPerMonth": 2500}'::jsonb,
    true
  ),
  (
    'enterprise', 'Enterprise', NULL, 'CAD',
    '{"trade_in": true, "cpo": true, "notifications": true, "knowledge_base": true, "rve": true, "reporting": true, "chat": true, "billing": true, "api_access": true}'::jsonb,
    '{"customers": -1, "users": -1, "storageMb": -1, "apiCallsPerMonth": 1000000, "transactionsPerMonth": -1}'::jsonb,
    true
  )
ON CONFLICT (slug) DO UPDATE SET
  name          = EXCLUDED.name,
  monthly_price = EXCLUDED.monthly_price,
  currency      = EXCLUDED.currency,
  features      = EXCLUDED.features,
  limits        = EXCLUDED.limits,
  is_active     = EXCLUDED.is_active;
