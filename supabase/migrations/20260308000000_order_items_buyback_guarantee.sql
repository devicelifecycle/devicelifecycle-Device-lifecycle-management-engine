-- ============================================================================
-- ORDER ITEMS: BUYBACK GUARANTEE (CPO)
-- ============================================================================
-- When companies buy devices via CPO, we guarantee we'll buy them back at
-- a specified price. Admin calculates using trade-in pricing logic.

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS guaranteed_buyback_price DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS buyback_condition device_condition,
  ADD COLUMN IF NOT EXISTS buyback_valid_until DATE;

COMMENT ON COLUMN order_items.guaranteed_buyback_price IS 'Per-unit price we guarantee to buy back (CPO orders)';
COMMENT ON COLUMN order_items.buyback_condition IS 'Condition required for buyback guarantee to apply (e.g. good)';
COMMENT ON COLUMN order_items.buyback_valid_until IS 'Buyback guarantee valid until this date (e.g. +24 months from quote)';
