-- ============================================================================
-- device_last_manual_prices: tracks the last price an admin manually set
-- for each (device, storage, condition) combination.
-- Upserted whenever an admin saves a manual price on an order item.
-- Used as high-trust source (weight 1.1) in pricing model training.
-- ============================================================================

CREATE TABLE IF NOT EXISTS device_last_manual_prices (
  device_id    UUID        NOT NULL REFERENCES device_catalog(id) ON DELETE CASCADE,
  storage      TEXT        NOT NULL DEFAULT '128GB',
  condition    TEXT        NOT NULL DEFAULT 'good',
  last_manual_price  NUMERIC(10,2) NOT NULL,
  last_set_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_order_id UUID       REFERENCES orders(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (device_id, storage, condition)
);

-- Index for bulk lookups by device_id (used by catalog + training)
CREATE INDEX IF NOT EXISTS idx_dlmp_device_id ON device_last_manual_prices(device_id);

-- RLS: internal staff can read; only service-role can write (via API route)
ALTER TABLE device_last_manual_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Internal users can read manual prices"
  ON device_last_manual_prices FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role IN ('admin', 'coe_manager', 'coe_tech', 'sales')
    )
  );
