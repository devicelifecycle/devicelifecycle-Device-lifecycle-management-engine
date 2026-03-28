-- ============================================================================
-- ORDERS: DEPRECIATION RATE OVERRIDE (CPO)
-- ============================================================================
-- Allow per-order override of global depreciation rate for buyback schedule.
-- When set, used instead of pricing_settings.cpo_depreciation_rate.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS depreciation_rate_override DECIMAL(5, 2);

COMMENT ON COLUMN orders.depreciation_rate_override IS 'Per-order override for annual depreciation % (CPO buyback schedule). When null, uses global pricing_settings.';
