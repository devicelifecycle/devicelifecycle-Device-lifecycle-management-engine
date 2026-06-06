-- SaaS readiness: add subscription/billing columns to organizations.
-- All columns are nullable with safe defaults — no existing queries are affected.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS plan               varchar(50)  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS billing_customer_id varchar(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS billing_subscription_id varchar(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS trial_ends_at      timestamptz  DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_trial           boolean      NOT NULL DEFAULT false;

COMMENT ON COLUMN organizations.plan IS 'Subscription plan key, e.g. starter | growth | enterprise';
COMMENT ON COLUMN organizations.billing_customer_id IS 'Stripe (or equivalent) customer ID';
COMMENT ON COLUMN organizations.billing_subscription_id IS 'Stripe (or equivalent) subscription ID';
COMMENT ON COLUMN organizations.trial_ends_at IS 'When the free trial expires (null = not on trial or trial never set)';
COMMENT ON COLUMN organizations.is_trial IS 'True while the org is on a free trial period';
