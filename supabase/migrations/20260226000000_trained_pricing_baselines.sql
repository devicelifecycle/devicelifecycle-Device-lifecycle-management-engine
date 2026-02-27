-- ============================================================================
-- TRAINED PRICING BASELINES
-- Store model coefficients learned from our own internal data
-- Reduces dependency on market_prices / competitor_prices
-- ============================================================================

-- Ensure order_items has storage (for training data consistency)
ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS storage VARCHAR(50);

ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS color VARCHAR(50);

-- ============================================================================
-- TRAINED BASELINES TABLE
-- Per (device_id, storage, condition): median price from our historical data
-- ============================================================================

CREATE TABLE IF NOT EXISTS trained_pricing_baselines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID NOT NULL REFERENCES device_catalog(id) ON DELETE CASCADE,
    storage VARCHAR(50) NOT NULL,
    carrier VARCHAR(100) DEFAULT 'Unlocked',
    condition VARCHAR(20) NOT NULL,

    -- Learned values
    median_trade_price DECIMAL(10, 2) NOT NULL,
    p25_trade_price DECIMAL(10, 2),
    p75_trade_price DECIMAL(10, 2),
    sample_count INTEGER NOT NULL DEFAULT 0,

    -- Metadata
    last_trained_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    data_sources TEXT[] DEFAULT ARRAY['order_items', 'imei_records', 'sales_history'],
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(device_id, storage, carrier, condition)
);

CREATE INDEX IF NOT EXISTS idx_trained_baselines_device ON trained_pricing_baselines(device_id);
CREATE INDEX IF NOT EXISTS idx_trained_baselines_lookup ON trained_pricing_baselines(device_id, storage, condition);

-- ============================================================================
-- TRAINED CONDITION MULTIPLIERS
-- Condition multipliers learned from our acceptance/adjustment data
-- ============================================================================

CREATE TABLE IF NOT EXISTS trained_condition_multipliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    condition VARCHAR(20) NOT NULL UNIQUE,
    multiplier DECIMAL(6, 4) NOT NULL,
    sample_count INTEGER NOT NULL DEFAULT 0,
    last_trained_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed defaults (will be overwritten when we have data)
INSERT INTO trained_condition_multipliers (condition, multiplier, sample_count)
VALUES
    ('new', 1.0, 0),
    ('excellent', 0.92, 0),
    ('good', 0.82, 0),
    ('fair', 0.65, 0),
    ('poor', 0.45, 0)
ON CONFLICT (condition) DO NOTHING;

-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE trained_pricing_baselines ENABLE ROW LEVEL SECURITY;
ALTER TABLE trained_condition_multipliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can manage trained baselines"
    ON trained_pricing_baselines FOR ALL
    USING (is_internal_user());

CREATE POLICY "Internal users can manage condition multipliers"
    ON trained_condition_multipliers FOR ALL
    USING (is_internal_user());

-- Triggers for updated_at
CREATE TRIGGER update_trained_baselines_updated_at
    BEFORE UPDATE ON trained_pricing_baselines
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_trained_multipliers_updated_at
    BEFORE UPDATE ON trained_condition_multipliers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
