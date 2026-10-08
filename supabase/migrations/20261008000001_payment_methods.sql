-- ============================================================================
-- PAYMENT METHODS TABLE — Phase 2 of DLM_COMMERCIAL_PLAN.md
-- ============================================================================
-- Stores tokenised payment method references. Card data NEVER touches our
-- servers — only the token, brand, last4, and expiry are stored. PCI SAQ-A.

DO $$ BEGIN
  CREATE TYPE payment_provider_type AS ENUM ('stripe', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS payment_methods (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider          payment_provider_type NOT NULL DEFAULT 'stripe',
  -- Provider's token (e.g. Stripe PaymentMethod ID pm_xxx)
  provider_token    TEXT NOT NULL,
  -- Display info only — never enough to charge without the provider
  brand             TEXT,          -- visa, mastercard, amex
  last4             TEXT,          -- last 4 digits
  exp_month         SMALLINT,
  exp_year          SMALLINT,
  is_default        BOOLEAN NOT NULL DEFAULT FALSE,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  -- Provider's customer ID (e.g. Stripe cus_xxx)
  provider_customer_id TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One default per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_methods_default
  ON payment_methods (tenant_id)
  WHERE is_default = TRUE AND is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_payment_methods_tenant
  ON payment_methods (tenant_id, is_active);

-- Charge log — every attempt, success or failure
CREATE TABLE IF NOT EXISTS payment_charges (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subscription_id     UUID REFERENCES subscriptions(id),
  payment_method_id   UUID REFERENCES payment_methods(id),
  provider            payment_provider_type NOT NULL,
  -- Provider's charge/payment-intent ID for idempotency + reconciliation
  provider_charge_id  TEXT,
  amount_cents        INTEGER NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'CAD',
  status              TEXT NOT NULL DEFAULT 'pending',  -- pending, succeeded, failed, refunded
  failure_reason      TEXT,
  idempotency_key     TEXT NOT NULL,
  metadata            JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_charges_idempotency
  ON payment_charges (idempotency_key);

CREATE INDEX IF NOT EXISTS idx_charges_tenant
  ON payment_charges (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_charges_subscription
  ON payment_charges (subscription_id, created_at DESC);

-- Webhook events — deduplicated by provider event ID
CREATE TABLE IF NOT EXISTS webhook_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider          payment_provider_type NOT NULL,
  provider_event_id TEXT NOT NULL,
  event_type        TEXT NOT NULL,
  payload           JSONB NOT NULL,
  processed         BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_events_dedup
  ON webhook_events (provider, provider_event_id);

-- RLS
ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_charges ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "service_role_full_pm" ON payment_methods
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_charges" ON payment_charges
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_webhooks" ON webhook_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Admin reads all
CREATE POLICY "admin_read_pm" ON payment_methods
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin'));
CREATE POLICY "admin_read_charges" ON payment_charges
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'admin'));

-- Tenant reads own
CREATE POLICY "tenant_read_own_pm" ON payment_methods
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT u.tenant_id FROM users u WHERE u.id = auth.uid()));
CREATE POLICY "tenant_read_own_charges" ON payment_charges
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT u.tenant_id FROM users u WHERE u.id = auth.uid()));

-- Add FK from subscriptions to payment_methods (deferred so both tables exist)
ALTER TABLE subscriptions
  ADD CONSTRAINT fk_subscriptions_payment_method
  FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id)
  ON DELETE SET NULL;

-- Auto-update updated_at on payment_methods
CREATE OR REPLACE FUNCTION update_payment_method_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payment_method_updated ON payment_methods;
CREATE TRIGGER trg_payment_method_updated
  BEFORE UPDATE ON payment_methods
  FOR EACH ROW EXECUTE FUNCTION update_payment_method_timestamp();
