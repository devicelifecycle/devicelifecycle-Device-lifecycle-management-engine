-- ============================================================================
-- CUSTOMER PLAN ASSIGNMENT (D1a)
-- 2026-08-23
--
-- Additive foundation for per-customer license/plan assignment: a VAR can now
-- assign one of its subscription plans to an individual customer.
--
-- Inheritance semantics (resolution precedence):
--   platform default -> VAR tenant plan (tenants.settings) ->
--   customer plan override (when customers.plan_id is set)
-- A NULL plan_id keeps today's behavior exactly: the customer inherits the
-- VAR tenant's license. ON DELETE SET NULL restores inheritance when the
-- referenced plan row disappears, so no customer is ever orphaned by a plan.
-- ============================================================================

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS plan_id UUID REFERENCES subscription_plans(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customers_plan_id
  ON customers(plan_id)
  WHERE plan_id IS NOT NULL;