-- ============================================================================
-- SHIPPO SHIPPING INTEGRATION
-- Stores Shippo identifiers, labels, rates, and tracking metadata on shipments.
-- ============================================================================

ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS shippo_shipment_id TEXT,
  ADD COLUMN IF NOT EXISTS shippo_rate_id TEXT,
  ADD COLUMN IF NOT EXISTS shippo_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS shippo_tracking_status TEXT,
  ADD COLUMN IF NOT EXISTS label_url TEXT,
  ADD COLUMN IF NOT EXISTS label_pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS rate_amount DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS rate_currency VARCHAR(10),
  ADD COLUMN IF NOT EXISTS shippo_raw JSONB;

CREATE INDEX IF NOT EXISTS idx_shipments_shippo_transaction_id ON shipments(shippo_transaction_id);
CREATE INDEX IF NOT EXISTS idx_shipments_shippo_shipment_id ON shipments(shippo_shipment_id);
CREATE INDEX IF NOT EXISTS idx_shipments_shippo_tracking_status ON shipments(shippo_tracking_status);
