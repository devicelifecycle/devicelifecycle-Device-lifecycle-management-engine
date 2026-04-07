-- ============================================================================
-- ADD EXCEPTION TRACKING FOR TRIAGE DISCREPANCIES
-- ============================================================================
-- Tracks condition mismatches (claimed vs. actual) and exception approvals
-- for COE + Admin sequential approval workflow

-- Step 1: Create severity enum for exceptions
CREATE TYPE exception_severity AS ENUM ('minor', 'moderate', 'major');

-- Step 2: Create approval status enum
CREATE TYPE exception_approval_status AS ENUM ('pending', 'coe_approved', 'admin_approved', 'rejected', 'overridden');

-- Step 3: Create exception type enum
CREATE TYPE exception_type_enum AS ENUM ('condition_mismatch', 'price_variance', 'missing_device', 'other');

-- Step 4: Add exception tracking columns to triage_results table
ALTER TABLE triage_results
ADD COLUMN exception_type exception_type_enum DEFAULT 'condition_mismatch',
ADD COLUMN mismatch_severity exception_severity DEFAULT 'minor',
ADD COLUMN approval_status exception_approval_status DEFAULT 'pending',
ADD COLUMN coe_notes TEXT,
ADD COLUMN admin_notes TEXT,
ADD COLUMN approved_by_coe_id UUID REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN approved_by_admin_id UUID REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN approved_at TIMESTAMP WITH TIME ZONE;

-- Step 5: Create order_exceptions table for audit trail
CREATE TABLE order_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  exception_type exception_type_enum NOT NULL DEFAULT 'condition_mismatch',
  severity exception_severity NOT NULL DEFAULT 'minor',
  summary TEXT NOT NULL,
  approval_status exception_approval_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  
  created_by_id UUID REFERENCES users(id),
  
  CONSTRAINT summary_not_empty CHECK (length(summary) > 0)
);

-- Step 6: Create indexes for order_exceptions
CREATE INDEX idx_order_exceptions_order ON order_exceptions(order_id);
CREATE INDEX idx_order_exceptions_status ON order_exceptions(approval_status);
CREATE INDEX idx_order_exceptions_severity ON order_exceptions(severity);
CREATE INDEX idx_order_exceptions_created ON order_exceptions(created_at DESC);

-- Step 7: Create function to calculate exception severity
CREATE OR REPLACE FUNCTION calculate_exception_severity(
  p_claimed_condition device_condition,
  p_actual_condition device_condition,
  p_price_variance_pct NUMERIC DEFAULT NULL
)
RETURNS exception_severity
LANGUAGE plpgsql
AS $$
DECLARE
  v_condition_rank_claimed INTEGER;
  v_condition_rank_actual INTEGER;
  v_tier_drop INTEGER;
BEGIN
  -- Map conditions to ranks (higher = better)
  -- new=5, excellent=4, good=3, fair=2, poor=1
  v_condition_rank_claimed := CASE p_claimed_condition
    WHEN 'new' THEN 5
    WHEN 'excellent' THEN 4
    WHEN 'good' THEN 3
    WHEN 'fair' THEN 2
    WHEN 'poor' THEN 1
    ELSE 0
  END;
  
  v_condition_rank_actual := CASE p_actual_condition
    WHEN 'new' THEN 5
    WHEN 'excellent' THEN 4
    WHEN 'good' THEN 3
    WHEN 'fair' THEN 2
    WHEN 'poor' THEN 1
    ELSE 0
  END;

  v_tier_drop := v_condition_rank_claimed - v_condition_rank_actual;

  -- Severity rules:
  -- Major: Excellent/New→Poor, Good→Poor, or price delta >15%
  IF (v_condition_rank_claimed >= 4 AND v_condition_rank_actual = 1) OR
     (v_condition_rank_claimed = 3 AND v_condition_rank_actual = 1) OR
     (p_price_variance_pct IS NOT NULL AND p_price_variance_pct > 15) THEN
    RETURN 'major';
  END IF;

  -- Moderate: Excellent/Good→Fair, or price delta 5-15%
  IF (v_condition_rank_claimed >= 3 AND v_condition_rank_actual = 2) OR
     (p_price_variance_pct IS NOT NULL AND p_price_variance_pct >= 5 AND p_price_variance_pct <= 15) THEN
    RETURN 'moderate';
  END IF;

  -- Minor: Any other downgrade or delta <5%
  IF v_tier_drop > 0 OR (p_price_variance_pct IS NOT NULL AND p_price_variance_pct > 0) THEN
    RETURN 'minor';
  END IF;

  RETURN 'minor';
END;
$$;

-- Step 8: Create trigger to flag exceptions on triage insert/update
CREATE OR REPLACE FUNCTION flag_triage_exception()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_severity exception_severity;
  v_price_delta_pct NUMERIC;
BEGIN
  -- Only flag if condition actually changed
  IF NEW.claimed_condition IS NOT NULL AND 
     NEW.actual_condition IS NOT NULL AND
     NEW.claimed_condition != NEW.actual_condition THEN
    
    -- Calculate severity
    v_price_delta_pct := CASE 
      WHEN NEW.price_adjustment IS NOT NULL AND NEW.price_adjustment != 0 THEN
        ABS(NEW.price_adjustment)
      ELSE NULL
    END;
    
    v_severity := calculate_exception_severity(
      NEW.claimed_condition,
      NEW.actual_condition,
      v_price_delta_pct
    );

    -- Set exception fields on triage result
    NEW.exception_type := 'condition_mismatch';
    NEW.mismatch_severity := v_severity;
    NEW.approval_status := 'pending';
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger that fires on insert/update
DROP TRIGGER IF EXISTS triage_exception_flag ON triage_results;
CREATE TRIGGER triage_exception_flag
BEFORE INSERT OR UPDATE ON triage_results
FOR EACH ROW
EXECUTE FUNCTION flag_triage_exception();

-- Step 9: Create function to create exception audit record
CREATE OR REPLACE FUNCTION create_exception_audit_record()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- If this is a new triage result with an exception, create audit record
  IF NEW.exception_type IS NOT NULL AND NEW.approval_status = 'pending' THEN
    INSERT INTO order_exceptions (
      order_id,
      order_item_id,
      exception_type,
      severity,
      summary,
      approval_status,
      created_by_id
    ) VALUES (
      NEW.order_id,
      (SELECT MIN(id) FROM order_items WHERE id IN (
        SELECT order_item_id FROM triage_results WHERE imei_record_id = NEW.imei_record_id LIMIT 1
      )),
      NEW.exception_type,
      NEW.mismatch_severity,
      'Condition discrepancy: ' || COALESCE(NEW.claimed_condition::TEXT, '?') || ' → ' || COALESCE(NEW.actual_condition::TEXT, '?'),
      NEW.approval_status,
      NEW.triaged_by_id
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Create trigger that creates exception audit records
DROP TRIGGER IF EXISTS triage_create_exception_audit ON triage_results;
CREATE TRIGGER triage_create_exception_audit
AFTER INSERT ON triage_results
FOR EACH ROW
EXECUTE FUNCTION create_exception_audit_record();

-- Step 10: Enable RLS on order_exceptions
ALTER TABLE order_exceptions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: COE/Admin can see all exceptions; Customers/Vendors see only for their orders
CREATE POLICY order_exceptions_visibility ON order_exceptions FOR SELECT
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'coe_manager', 'coe_tech')
    OR
    (
      (SELECT role FROM users WHERE id = auth.uid()) = 'customer'
      AND order_id IN (
        SELECT id FROM orders WHERE customer_id IN (
          SELECT id FROM customers WHERE organization_id = (SELECT organization_id FROM users WHERE id = auth.uid())
        )
      )
    )
  );

-- RLS Policy: Only COE/Admin can update exceptions
CREATE POLICY order_exceptions_update ON order_exceptions FOR UPDATE
  USING (
    (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'coe_manager', 'coe_tech')
  );

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Test severity calculation:
-- SELECT calculate_exception_severity('good', 'fair', NULL);  -- Should be 'moderate'
-- SELECT calculate_exception_severity('excellent', 'poor', NULL);  -- Should be 'major'
-- SELECT calculate_exception_severity('good', 'good', NULL);  -- Should be 'minor'

-- ============================================================================
