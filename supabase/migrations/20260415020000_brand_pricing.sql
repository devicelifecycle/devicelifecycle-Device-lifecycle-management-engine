-- ============================================================================
-- P4 #16 — Per-brand pricing overrides
-- ============================================================================
-- Allows admins to set a device-brand-specific margin target that overrides
-- the global pricing_settings value when no per-call override is provided.

CREATE TABLE IF NOT EXISTS brand_pricing_overrides (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  make          text        NOT NULL UNIQUE,   -- e.g. 'Apple', 'Samsung', 'Google'
  margin_percent numeric(5,2),                  -- NULL = use global setting
  enabled       boolean     NOT NULL DEFAULT true,
  notes         text,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE brand_pricing_overrides ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read (needed by pricing service running as user session)
CREATE POLICY brand_pricing_overrides_select ON brand_pricing_overrides
  FOR SELECT USING (auth.role() IN ('authenticated', 'service_role'));

-- Only admin (or service_role) can write
CREATE POLICY brand_pricing_overrides_write ON brand_pricing_overrides
  FOR ALL USING (
    auth.role() = 'service_role'
    OR (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  );

-- ── Add demand_adjustment_enabled to pricing_settings ────────────────────────
-- Inserted as a row in the KV store (no schema change needed).
-- Default is false — demand adjustment is opt-in.
INSERT INTO pricing_settings (setting_key, setting_value)
  VALUES ('demand_adjustment_enabled', 'false')
  ON CONFLICT (setting_key) DO NOTHING;
