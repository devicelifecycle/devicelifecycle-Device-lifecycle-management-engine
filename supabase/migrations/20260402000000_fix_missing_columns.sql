-- ============================================================================
-- Fix missing columns referenced in services but absent from schema
-- 1. shipments.out_for_delivery_at  — used by ShipmentService.updateStatus()
-- 2. imei_records.current_customer_id — used by IMEIService.assignToCustomer()
-- 3. imei_records.warranty_end_date — used by IMEIService.checkWarrantyEligibility()
-- ============================================================================

-- 1. Shipments: out_for_delivery_at timestamp
ALTER TABLE shipments
  ADD COLUMN IF NOT EXISTS out_for_delivery_at TIMESTAMPTZ;

-- 2. IMEI Records: current customer assignment
ALTER TABLE imei_records
  ADD COLUMN IF NOT EXISTS current_customer_id UUID REFERENCES customers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_imei_records_current_customer_id
  ON imei_records(current_customer_id);

-- 3. IMEI Records: warranty end date (separate from warranty_expiry which tracks
--    the vendor warranty; this tracks the warranty offered to the end customer)
ALTER TABLE imei_records
  ADD COLUMN IF NOT EXISTS warranty_end_date DATE;

-- RLS: existing policies on imei_records and shipments already cover these new
-- columns since they use row-level rules, not column-level rules.
