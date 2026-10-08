-- ============================================================================
-- SUBSCRIPTIONS TABLE — Phase 1 of DLM_COMMERCIAL_PLAN.md
-- ============================================================================
-- Wires the pure subscription engine (src/lib/subscription.ts) to the database.
-- Each tenant gets at most one active subscription row. The cron advances
-- periods, expires trials, and marks past-due; the payment system transitions
-- to 'active' on a successful charge.

-- Status enum
DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM (
    'trialing', 'active', 'past_due', 'cancelled', 'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Billing interval enum
DO $$ BEGIN
  CREATE TYPE billing_interval AS ENUM ('month', 'year');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS subscriptions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_slug             TEXT NOT NULL REFERENCES subscription_plans(slug),
  status                subscription_status NOT NULL DEFAULT 'trialing',
  billing_interval      billing_interval NOT NULL DEFAULT 'month',
  current_period_start  TIMESTAMPTZ NOT NULL DEFAULT now(),
  current_period_end    TIMESTAMPTZ NOT NULL,
  trial_ends_at         TIMESTAMPTZ,
  cancel_at_period_end  BOOLEAN NOT NULL DEFAULT FALSE,
  past_due_since        TIMESTAMPTZ,
  -- Payment linkage (Phase 2)
  payment_method_id     UUID,
  stripe_subscription_id TEXT,
  -- Proration credit from a downgrade, applied to the next invoice
  credit_balance_cents  INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One active subscription per tenant (expired/cancelled rows kept for history)
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_tenant_active
  ON subscriptions (tenant_id)
  WHERE status NOT IN ('expired');

CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions (status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_period_end ON subscriptions (current_period_end);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan ON subscriptions (plan_slug);

-- Audit: who changed what
CREATE TABLE IF NOT EXISTS subscription_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,
  from_status     subscription_status,
  to_status       subscription_status,
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_sub
  ON subscription_events (subscription_id, created_at DESC);

-- RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;

-- Service role (cron, admin) can do everything
CREATE POLICY "service_role_full_subscriptions" ON subscriptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_sub_events" ON subscription_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Admins can read all
CREATE POLICY "admin_read_subscriptions" ON subscriptions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users u
      WHERE u.id = auth.uid() AND u.role = 'admin'
    )
  );

-- VAR users can read their own tenant's subscription
CREATE POLICY "tenant_read_own_subscription" ON subscriptions
  FOR SELECT TO authenticated
  USING (
    tenant_id IN (
      SELECT u.tenant_id FROM users u WHERE u.id = auth.uid()
    )
  );

CREATE POLICY "tenant_read_own_sub_events" ON subscription_events
  FOR SELECT TO authenticated
  USING (
    subscription_id IN (
      SELECT s.id FROM subscriptions s
      JOIN users u ON u.tenant_id = s.tenant_id
      WHERE u.id = auth.uid()
    )
  );

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_subscription_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_subscription_updated ON subscriptions;
CREATE TRIGGER trg_subscription_updated
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_subscription_timestamp();
