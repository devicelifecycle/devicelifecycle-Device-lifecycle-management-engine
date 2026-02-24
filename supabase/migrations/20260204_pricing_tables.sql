-- ============================================================================
-- PRICING TABLES MIGRATION
-- Additional tables for margin settings and functional deductions
-- ============================================================================

-- ============================================================================
-- MARGIN SETTINGS TABLE
-- Stores configurable business settings for pricing
-- ============================================================================

CREATE TABLE IF NOT EXISTS margin_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_margin_settings_key ON margin_settings(setting_key);

-- ============================================================================
-- FUNCTIONAL DEDUCTIONS TABLE
-- Stores issue-based price deductions
-- ============================================================================

CREATE TABLE IF NOT EXISTS functional_deductions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    issue_code VARCHAR(50) UNIQUE NOT NULL,
    issue_name VARCHAR(100) NOT NULL,
    deduction_type VARCHAR(20) NOT NULL CHECK (deduction_type IN ('percentage', 'fixed')),
    deduction_value DECIMAL(10, 2) NOT NULL,
    applies_to_categories TEXT[] DEFAULT ARRAY['phone', 'tablet', 'laptop', 'watch', 'other'],
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for lookups
CREATE INDEX IF NOT EXISTS idx_functional_deductions_code ON functional_deductions(issue_code);
CREATE INDEX IF NOT EXISTS idx_functional_deductions_active ON functional_deductions(is_active);

-- ============================================================================
-- SALES HISTORY TABLE
-- For historical price blending
-- ============================================================================

CREATE TABLE IF NOT EXISTS sales_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID REFERENCES device_catalog(id),
    storage VARCHAR(50),
    carrier VARCHAR(100),
    condition VARCHAR(20),
    sold_price DECIMAL(10, 2) NOT NULL,
    sold_date TIMESTAMPTZ DEFAULT NOW(),
    order_id UUID REFERENCES orders(id),
    transaction_type VARCHAR(20) CHECK (transaction_type IN ('buy', 'sell')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for historical lookups
CREATE INDEX IF NOT EXISTS idx_sales_history_device ON sales_history(device_id);
CREATE INDEX IF NOT EXISTS idx_sales_history_date ON sales_history(sold_date);
CREATE INDEX IF NOT EXISTS idx_sales_history_lookup ON sales_history(device_id, storage, condition, sold_date DESC);

-- ============================================================================
-- UPDATE PRICING_TABLES to add buy_price and sell_price
-- ============================================================================

-- Add columns if they don't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'pricing_tables' AND column_name = 'buy_price') THEN
        ALTER TABLE pricing_tables ADD COLUMN buy_price DECIMAL(10, 2);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'pricing_tables' AND column_name = 'sell_price') THEN
        ALTER TABLE pricing_tables ADD COLUMN sell_price DECIMAL(10, 2);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'pricing_tables' AND column_name = 'storage') THEN
        ALTER TABLE pricing_tables ADD COLUMN storage VARCHAR(50);
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'pricing_tables' AND column_name = 'carrier') THEN
        ALTER TABLE pricing_tables ADD COLUMN carrier VARCHAR(100) DEFAULT 'Unlocked';
    END IF;
END $$;

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE margin_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE functional_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_history ENABLE ROW LEVEL SECURITY;

-- Margin settings - admin only
CREATE POLICY "Admins can manage margin settings"
    ON margin_settings
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'coe_manager')
        )
    );

-- Everyone can read margin settings
CREATE POLICY "Anyone can read margin settings"
    ON margin_settings
    FOR SELECT
    USING (true);

-- Functional deductions - admin only for write
CREATE POLICY "Admins can manage functional deductions"
    ON functional_deductions
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'coe_manager')
        )
    );

-- Everyone can read functional deductions
CREATE POLICY "Anyone can read functional deductions"
    ON functional_deductions
    FOR SELECT
    USING (true);

-- Sales history - internal only
CREATE POLICY "Internal users can read sales history"
    ON sales_history
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role NOT IN ('customer', 'vendor')
        )
    );

CREATE POLICY "Internal users can insert sales history"
    ON sales_history
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role NOT IN ('customer', 'vendor')
        )
    );

-- ============================================================================
-- TRIGGERS for updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_margin_settings_updated_at ON margin_settings;
CREATE TRIGGER update_margin_settings_updated_at
    BEFORE UPDATE ON margin_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_functional_deductions_updated_at ON functional_deductions;
CREATE TRIGGER update_functional_deductions_updated_at
    BEFORE UPDATE ON functional_deductions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
