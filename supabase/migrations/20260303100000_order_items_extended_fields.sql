-- ============================================================================
-- EXTEND ORDER_ITEMS WITH IMEI, SERIAL, COLOUR, AND DEVICE METADATA
-- ============================================================================
-- Supports richer CSV imports: trade-in (per-device with IMEI),
-- CPO (bulk quantity), and vendor inventory (laptops with CPU/RAM/etc.)

-- Per-device identifiers
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS imei VARCHAR(20),
  ADD COLUMN IF NOT EXISTS serial_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS colour VARCHAR(50);

-- Extended device metadata (for laptops, tablets, etc.)
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS cpu VARCHAR(100),
  ADD COLUMN IF NOT EXISTS ram VARCHAR(50),
  ADD COLUMN IF NOT EXISTS screen_size VARCHAR(50),
  ADD COLUMN IF NOT EXISTS year INTEGER,
  ADD COLUMN IF NOT EXISTS model_number VARCHAR(50),
  ADD COLUMN IF NOT EXISTS accessories TEXT,
  ADD COLUMN IF NOT EXISTS faults TEXT;

-- Index on IMEI for lookups
CREATE INDEX IF NOT EXISTS idx_order_items_imei ON order_items(imei) WHERE imei IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_items_serial ON order_items(serial_number) WHERE serial_number IS NOT NULL;

COMMENT ON COLUMN order_items.imei IS 'Device IMEI number (15 digits, for phones)';
COMMENT ON COLUMN order_items.serial_number IS 'Device serial number (for laptops, tablets)';
COMMENT ON COLUMN order_items.colour IS 'Device colour from CSV import';
COMMENT ON COLUMN order_items.model_number IS 'Apple/manufacturer model number (e.g., A2141)';
COMMENT ON COLUMN order_items.faults IS 'Known faults/issues from CSV import';
COMMENT ON COLUMN order_items.accessories IS 'Included accessories (charger, cable, etc.)';
