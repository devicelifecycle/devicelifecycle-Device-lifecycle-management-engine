-- ============================================================================
-- CUSTOMERS DEFAULT RISK MODE
-- Allows customer-specific pricing mode (retail vs enterprise)
-- ============================================================================

ALTER TABLE customers
ADD COLUMN IF NOT EXISTS default_risk_mode VARCHAR(20) CHECK (default_risk_mode IN ('retail', 'enterprise'));

COMMENT ON COLUMN customers.default_risk_mode IS 'Default risk mode for pricing: retail (higher margin) or enterprise (lower margin)';
