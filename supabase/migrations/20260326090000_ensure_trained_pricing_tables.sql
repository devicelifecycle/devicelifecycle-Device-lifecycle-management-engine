-- ============================================================================
-- ENSURE TRAINED PRICING TABLES EXIST + REFRESH POSTGREST SCHEMA CACHE
-- Some environments recorded the original migration but the REST schema cache
-- still cannot see trained_pricing_baselines / trained_condition_multipliers.
-- This migration is idempotent and safe to re-run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS trained_pricing_baselines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES device_catalog(id) ON DELETE CASCADE,
    storage VARCHAR(50) NOT NULL,
    carrier VARCHAR(100) DEFAULT 'Unlocked',
    condition VARCHAR(20) NOT NULL,
    median_trade_price DECIMAL(10, 2) NOT NULL,
    p25_trade_price DECIMAL(10, 2),
    p75_trade_price DECIMAL(10, 2),
    sample_count INTEGER NOT NULL DEFAULT 0,
    last_trained_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    data_sources TEXT[] DEFAULT ARRAY['order_items', 'imei_records', 'sales_history'],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(device_id, storage, carrier, condition)
);

CREATE INDEX IF NOT EXISTS idx_trained_baselines_device ON trained_pricing_baselines(device_id);
CREATE INDEX IF NOT EXISTS idx_trained_baselines_lookup ON trained_pricing_baselines(device_id, storage, condition);

CREATE TABLE IF NOT EXISTS trained_condition_multipliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condition VARCHAR(20) NOT NULL UNIQUE,
    multiplier DECIMAL(6, 4) NOT NULL,
    sample_count INTEGER NOT NULL DEFAULT 0,
    last_trained_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO trained_condition_multipliers (condition, multiplier, sample_count)
VALUES
    ('new', 1.0, 0),
    ('excellent', 0.92, 0),
    ('good', 0.82, 0),
    ('fair', 0.65, 0),
    ('poor', 0.45, 0)
ON CONFLICT (condition) DO NOTHING;

ALTER TABLE trained_pricing_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE trained_condition_multipliers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'trained_pricing_baselines'
      AND policyname = 'Internal users can manage trained baselines'
  ) THEN
    CREATE POLICY "Internal users can manage trained baselines"
      ON trained_pricing_baselines FOR ALL
      USING (is_internal_user());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'trained_condition_multipliers'
      AND policyname = 'Internal users can manage condition multipliers'
  ) THEN
    CREATE POLICY "Internal users can manage condition multipliers"
      ON trained_condition_multipliers FOR ALL
      USING (is_internal_user());
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_trained_baselines_updated_at'
  ) THEN
    CREATE TRIGGER update_trained_baselines_updated_at
      BEFORE UPDATE ON trained_pricing_baselines
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'update_trained_multipliers_updated_at'
  ) THEN
    CREATE TRIGGER update_trained_multipliers_updated_at
      BEFORE UPDATE ON trained_condition_multipliers
      FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
