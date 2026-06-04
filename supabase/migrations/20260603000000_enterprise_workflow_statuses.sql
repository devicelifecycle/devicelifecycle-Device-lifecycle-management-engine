-- ============================================================================
-- ENTERPRISE WORKFLOW: NEW ORDER STATUSES + PAYMENT FIELDS
--
-- Adds:
--   mismatch_review  — order-level status: triage found condition differences,
--                      customer must approve or dispute before payment proceeds
--   payment_processing — payment prepared/initiated, awaiting confirmation
--
-- Also adds payment recording fields to orders table so admin can log
-- method, reference number, and notes when marking payment_sent.
-- ============================================================================

-- Add new enum values (idempotent — IF NOT EXISTS requires Postgres 14+; use DO block for safety)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'order_status'::regtype
      AND enumlabel = 'mismatch_review'
  ) THEN
    ALTER TYPE order_status ADD VALUE 'mismatch_review';
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumtypid = 'order_status'::regtype
      AND enumlabel = 'payment_processing'
  ) THEN
    ALTER TYPE order_status ADD VALUE 'payment_processing';
  END IF;
END
$$;

-- Payment recording fields on orders
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS payment_method        VARCHAR(50),
  ADD COLUMN IF NOT EXISTS payment_reference     VARCHAR(100),
  ADD COLUMN IF NOT EXISTS payment_notes         TEXT,
  ADD COLUMN IF NOT EXISTS payment_processed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS mismatch_reviewed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payment_processing_at TIMESTAMPTZ;

-- Index for payment status queries
CREATE INDEX IF NOT EXISTS idx_orders_payment_method
  ON orders (payment_method)
  WHERE payment_method IS NOT NULL;
