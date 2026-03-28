-- Add quote_expires_at to orders (30-day trade-in approval window)
ALTER TABLE orders ADD COLUMN IF NOT EXISTS quote_expires_at TIMESTAMPTZ;

-- Backfill: set expiry for any existing quoted orders (30 days from quoted_at)
UPDATE orders
SET quote_expires_at = quoted_at + INTERVAL '30 days'
WHERE status = 'quoted' AND quoted_at IS NOT NULL AND quote_expires_at IS NULL;
