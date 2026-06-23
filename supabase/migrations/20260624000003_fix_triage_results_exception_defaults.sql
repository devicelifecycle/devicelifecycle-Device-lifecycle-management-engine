-- ============================================================================
-- FIX: triage_results.exception_type / mismatch_severity / approval_status had
-- non-null defaults ('condition_mismatch' / 'minor' / 'pending'), so EVERY
-- triage submission — not just ones with an actual condition mismatch — looked
-- like a flagged exception to the AFTER-INSERT audit trigger
-- (create_exception_audit_record), which then crashed on its own unrelated
-- MIN(uuid) bug. Net effect: every triage submission failed.
--
-- These columns should default to NULL (no exception) and only get populated
-- by flag_triage_exception() when a real condition mismatch is detected.
-- Also fixes the MIN(uuid) bug in create_exception_audit_record — MIN() has
-- no default aggregate for uuid; this column is already a single resolved
-- value (LIMIT 1), so MIN() was always redundant here.
-- ============================================================================

ALTER TABLE triage_results
  ALTER COLUMN exception_type DROP DEFAULT,
  ALTER COLUMN mismatch_severity DROP DEFAULT,
  ALTER COLUMN approval_status DROP DEFAULT;

-- Existing rows that were never real exceptions (exception_required = false)
-- but got the bogus default values — clear them so they don't show up as
-- false "pending exceptions" anywhere.
UPDATE triage_results
SET exception_type = NULL, mismatch_severity = NULL, approval_status = NULL
WHERE exception_required = false
  AND exception_type = 'condition_mismatch'
  AND approval_status = 'pending'
  AND exception_approved_at IS NULL;

CREATE OR REPLACE FUNCTION public.create_exception_audit_record()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_claimed_condition device_condition;
  v_order_item_id uuid;
BEGIN
  -- If this is a new triage result with an exception, create audit record
  IF NEW.exception_type IS NOT NULL AND NEW.approval_status = 'pending' THEN
    SELECT claimed_condition INTO v_claimed_condition
    FROM imei_records
    WHERE id = NEW.imei_record_id;

    SELECT order_item_id INTO v_order_item_id
    FROM triage_results
    WHERE imei_record_id = NEW.imei_record_id
    LIMIT 1;

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
      v_order_item_id,
      NEW.exception_type,
      NEW.mismatch_severity,
      'Condition discrepancy: ' || COALESCE(v_claimed_condition::TEXT, '?') || ' → ' || COALESCE(NEW.final_condition::TEXT, '?'),
      NEW.approval_status,
      NEW.triaged_by_id
    );
  END IF;

  RETURN NEW;
END;
$function$;
