-- ============================================================================
-- INTERNATIONAL PRICING SUPPORT
-- Adds region-specific pricing and manual upload tracking
-- ============================================================================

-- Add region/country columns to existing tables
ALTER TABLE market_prices 
  ADD COLUMN IF NOT EXISTS region VARCHAR(50) DEFAULT 'NA',
  ADD COLUMN IF NOT EXISTS country_code VARCHAR(3) DEFAULT 'CA';

ALTER TABLE competitor_prices
  ADD COLUMN IF NOT EXISTS region VARCHAR(50) DEFAULT 'NA',
  ADD COLUMN IF NOT EXISTS country_code VARCHAR(3) DEFAULT 'CA';

-- ============================================================================
-- INTERNATIONAL PRICING TABLE
-- Stores manually uploaded international pricing data
-- ============================================================================

CREATE TABLE IF NOT EXISTS international_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID REFERENCES device_catalog(id) ON DELETE CASCADE,
    storage VARCHAR(50) NOT NULL,
    condition VARCHAR(20) NOT NULL DEFAULT 'good' CHECK (condition IN ('excellent', 'good', 'fair', 'poor', 'broken')),
    
    -- Pricing
    trade_in_price DECIMAL(10,2),
    cpo_price DECIMAL(10,2),
    wholesale_price DECIMAL(10,2),
    retail_price DECIMAL(10,2),
    
    -- Regional info
    region VARCHAR(50) NOT NULL,          -- 'EU', 'APAC', 'LATAM', 'NA', 'MEA'
    country_code VARCHAR(3) NOT NULL,     -- 'US', 'CA', 'UK', 'DE', 'JP', etc.
    currency VARCHAR(3) NOT NULL DEFAULT 'USD',
    exchange_rate DECIMAL(10,6) DEFAULT 1.0,  -- Rate to CAD for normalization
    
    -- Source tracking
    source VARCHAR(100) DEFAULT 'manual_upload',
    upload_batch_id UUID,                 -- Links to pricing_uploads table
    
    -- Metadata
    effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
    expiry_date DATE,
    is_active BOOLEAN DEFAULT true,
    notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by_id UUID REFERENCES users(id),
    
    UNIQUE(device_id, storage, condition, region, country_code, effective_date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_international_prices_device ON international_prices(device_id);
CREATE INDEX IF NOT EXISTS idx_international_prices_region ON international_prices(region);
CREATE INDEX IF NOT EXISTS idx_international_prices_country ON international_prices(country_code);
CREATE INDEX IF NOT EXISTS idx_international_prices_lookup ON international_prices(device_id, storage, condition, region, is_active);

-- ============================================================================
-- PRICING UPLOADS TABLE
-- Track manual file uploads for audit trail
-- ============================================================================

CREATE TABLE IF NOT EXISTS pricing_uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename VARCHAR(255) NOT NULL,
    file_type VARCHAR(50) NOT NULL,       -- 'csv', 'xlsx'
    file_size_bytes INTEGER,
    
    -- Processing results
    total_rows INTEGER,
    processed_rows INTEGER,
    error_rows INTEGER,
    warnings TEXT[],
    errors TEXT[],
    
    -- Upload type
    upload_type VARCHAR(50) NOT NULL,     -- 'international', 'competitor', 'market', 'training'
    region VARCHAR(50),
    country_code VARCHAR(3),
    
    -- Status
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    processed_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by_id UUID REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_pricing_uploads_status ON pricing_uploads(status);
CREATE INDEX IF NOT EXISTS idx_pricing_uploads_type ON pricing_uploads(upload_type);

-- ============================================================================
-- TRAINING DATA TABLE
-- Stores pricing training data for ML model
-- ============================================================================

CREATE TABLE IF NOT EXISTS pricing_training_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    device_id UUID REFERENCES device_catalog(id) ON DELETE CASCADE,
    
    -- Device attributes
    device_make VARCHAR(100) NOT NULL,
    device_model VARCHAR(100) NOT NULL,
    storage VARCHAR(50) NOT NULL,
    condition VARCHAR(20) NOT NULL,
    carrier VARCHAR(100) DEFAULT 'Unlocked',
    
    -- Pricing data (training features)
    trade_in_price DECIMAL(10,2),
    cpo_price DECIMAL(10,2),
    wholesale_price DECIMAL(10,2),
    retail_price DECIMAL(10,2),
    competitor_avg_price DECIMAL(10,2),
    
    -- Calculated margins
    trade_in_margin_percent DECIMAL(5,2),
    cpo_margin_percent DECIMAL(5,2),
    
    -- Context data
    region VARCHAR(50) DEFAULT 'NA',
    country_code VARCHAR(3) DEFAULT 'CA',
    order_type VARCHAR(20),               -- 'trade_in', 'cpo'
    customer_type VARCHAR(50),            -- 'enterprise', 'retail', 'wholesale'
    
    -- Outcome data (what actually happened)
    final_sale_price DECIMAL(10,2),
    days_to_sell INTEGER,
    was_accepted BOOLEAN,
    
    -- Source tracking
    source VARCHAR(100) NOT NULL,         -- 'order_complete', 'manual_import', 'simulation'
    source_order_id UUID REFERENCES orders(id),
    source_item_id UUID,
    
    -- Metadata
    training_date DATE NOT NULL DEFAULT CURRENT_DATE,
    is_validated BOOLEAN DEFAULT false,
    validation_score DECIMAL(5,3),        -- 0-1 score for data quality
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_data_device ON pricing_training_data(device_id);
CREATE INDEX IF NOT EXISTS idx_training_data_condition ON pricing_training_data(condition);
CREATE INDEX IF NOT EXISTS idx_training_data_validated ON pricing_training_data(is_validated);
CREATE INDEX IF NOT EXISTS idx_training_data_source ON pricing_training_data(source);

-- RLS Policies
ALTER TABLE international_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_training_data ENABLE ROW LEVEL SECURITY;

-- Allow admin/service role full access
CREATE POLICY "Admin full access international_prices" ON international_prices
    FOR ALL TO authenticated 
    USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'coe_manager')));

CREATE POLICY "Admin full access pricing_uploads" ON pricing_uploads
    FOR ALL TO authenticated 
    USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'coe_manager')));

CREATE POLICY "Admin full access pricing_training_data" ON pricing_training_data
    FOR ALL TO authenticated 
    USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('admin', 'coe_manager')));

-- Service role bypass
CREATE POLICY "Service role bypass international_prices" ON international_prices FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role bypass pricing_uploads" ON pricing_uploads FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role bypass pricing_training_data" ON pricing_training_data FOR ALL USING (auth.role() = 'service_role');
