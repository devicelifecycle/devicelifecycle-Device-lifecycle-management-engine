-- ============================================================================
-- PRICING SETTINGS TABLE
-- Stores configurable thresholds and margins for the pricing engine
-- ============================================================================

CREATE TABLE IF NOT EXISTS pricing_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pricing_settings_key ON pricing_settings(setting_key);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_pricing_settings_updated_at ON pricing_settings;
CREATE TRIGGER update_pricing_settings_updated_at
    BEFORE UPDATE ON pricing_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE pricing_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can read pricing settings"
    ON pricing_settings FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role NOT IN ('customer', 'vendor')
        )
    );

CREATE POLICY "Admins can manage pricing settings"
    ON pricing_settings FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'coe_manager')
        )
    );

-- Seed default values from current constants
INSERT INTO pricing_settings (setting_key, setting_value, description) VALUES
    ('channel_green_min', '0.30', 'Minimum margin for green tier (direct wholesale viable)'),
    ('channel_yellow_min', '0.20', 'Minimum margin for yellow tier (check MP opportunity)'),
    ('marketplace_fee_percent', '12', 'Marketplace fee percentage'),
    ('breakage_risk_percent', '5', 'Breakage risk deduction percentage'),
    ('competitive_relevance_min', '0.85', 'Minimum fraction of highest competitor we must meet'),
    ('outlier_deviation_threshold', '0.20', 'Flag outlier if trade price deviates more than this from 30-day avg'),
    ('trade_in_profit_percent', '20', 'Trade-in profit target (retail)'),
    ('enterprise_margin_percent', '12', 'Margin target for enterprise risk mode'),
    ('cpo_markup_percent', '25', 'CPO markup (retail)'),
    ('cpo_enterprise_markup_percent', '18', 'CPO markup (enterprise)'),
    ('price_staleness_days', '7', 'Competitor data older than this triggers staleness warning')
ON CONFLICT (setting_key) DO NOTHING;
