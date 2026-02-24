-- ============================================================================
-- PRICING V2 — Market-Referenced Competitive Pricing Model
-- Adds market prices, competitor prices, and repair costs tables
-- ============================================================================

-- ============================================================================
-- MARKET PRICES TABLE
-- Wholesale & marketplace reference prices per device SKU
-- Mirrors the company's "Sample Price Chart" spreadsheet
-- ============================================================================

CREATE TABLE IF NOT EXISTS market_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID REFERENCES device_catalog(id) ON DELETE CASCADE,
    storage VARCHAR(50) NOT NULL,
    carrier VARCHAR(100) DEFAULT 'Unlocked',

    -- Wholesale grade prices (spreadsheet cols D & E)
    wholesale_b_minus DECIMAL(10,2),
    wholesale_c_stock DECIMAL(10,2),

    -- Marketplace prices (spreadsheet cols N, J, K)
    marketplace_price DECIMAL(10,2),
    marketplace_good DECIMAL(10,2),
    marketplace_fair DECIMAL(10,2),

    -- Company's set prices (spreadsheet col D&D and derived)
    trade_price DECIMAL(10,2),
    cpo_price DECIMAL(10,2),

    -- Metadata
    currency VARCHAR(3) DEFAULT 'CAD',
    effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
    is_active BOOLEAN DEFAULT true,
    updated_by_id UUID REFERENCES users(id),
    source VARCHAR(50) DEFAULT 'Manual',  -- Go Recell, Sell By, Apple Trade-in, Manual, Spreadsheet
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(device_id, storage, carrier, effective_date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_market_prices_device ON market_prices(device_id);
CREATE INDEX IF NOT EXISTS idx_market_prices_active ON market_prices(is_active);
CREATE INDEX IF NOT EXISTS idx_market_prices_lookup ON market_prices(device_id, storage, carrier, effective_date DESC);

-- ============================================================================
-- COMPETITOR PRICES TABLE
-- Track competitor trade-in and resale offers (Telus, Bell, Gazelle, etc.)
-- ============================================================================

CREATE TABLE IF NOT EXISTS competitor_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID REFERENCES device_catalog(id) ON DELETE CASCADE,
    storage VARCHAR(50) NOT NULL,
    competitor_name VARCHAR(100) NOT NULL,
    trade_in_price DECIMAL(10,2),
    sell_price DECIMAL(10,2),
    source VARCHAR(50) DEFAULT 'manual',
    scraped_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_competitor_prices_device ON competitor_prices(device_id);
CREATE INDEX IF NOT EXISTS idx_competitor_prices_lookup ON competitor_prices(device_id, storage, competitor_name);

-- ============================================================================
-- REPAIR COSTS TABLE
-- Value-add service pricing (buffing, glass replacement, LCD, etc.)
-- ============================================================================

CREATE TABLE IF NOT EXISTS repair_costs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repair_type VARCHAR(50) NOT NULL,
    device_category VARCHAR(50),
    cost DECIMAL(10,2) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(repair_type, device_category)
);

CREATE INDEX IF NOT EXISTS idx_repair_costs_type ON repair_costs(repair_type);
CREATE INDEX IF NOT EXISTS idx_repair_costs_active ON repair_costs(is_active);

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE market_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE competitor_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE repair_costs ENABLE ROW LEVEL SECURITY;

-- Market prices: internal users can read, admin/coe_manager can write
CREATE POLICY "Internal users can read market prices"
    ON market_prices FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role NOT IN ('customer', 'vendor')
        )
    );

CREATE POLICY "Admins can manage market prices"
    ON market_prices FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'coe_manager')
        )
    );

-- Competitor prices: internal read, admin write
CREATE POLICY "Internal users can read competitor prices"
    ON competitor_prices FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role NOT IN ('customer', 'vendor')
        )
    );

CREATE POLICY "Admins can manage competitor prices"
    ON competitor_prices FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'coe_manager')
        )
    );

-- Repair costs: everyone reads, admin writes
CREATE POLICY "Anyone can read repair costs"
    ON repair_costs FOR SELECT
    USING (true);

CREATE POLICY "Admins can manage repair costs"
    ON repair_costs FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'coe_manager')
        )
    );

-- ============================================================================
-- TRIGGERS for updated_at
-- ============================================================================

DROP TRIGGER IF EXISTS update_market_prices_updated_at ON market_prices;
CREATE TRIGGER update_market_prices_updated_at
    BEFORE UPDATE ON market_prices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_competitor_prices_updated_at ON competitor_prices;
CREATE TRIGGER update_competitor_prices_updated_at
    BEFORE UPDATE ON competitor_prices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
