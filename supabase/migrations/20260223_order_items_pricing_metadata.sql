-- Add pricing_metadata to order_items for storing calculator suggestion context
ALTER TABLE order_items
ADD COLUMN IF NOT EXISTS pricing_metadata JSONB DEFAULT NULL;

COMMENT ON COLUMN order_items.pricing_metadata IS 'Metadata from price calculator when using Suggest Price: { suggested_by_calc, confidence, margin_tier, ... }';
