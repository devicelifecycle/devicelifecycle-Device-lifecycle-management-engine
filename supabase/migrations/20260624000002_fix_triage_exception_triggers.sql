-- ============================================================================
-- FIX: triage_results triggers referenced NEW.claimed_condition / NEW.actual_condition,
-- columns that have never existed on triage_results (it has final_condition and a
-- condition_changed boolean instead; claimed_condition lives on imei_records).
-- This made EVERY insert into triage_results fail with:
--   "record \"new\" has no field \"claimed_condition\""
-- i.e. every triage submission (single or batch) was broken.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.flag_triage_exception()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_severity exception_severity;
  v_price_delta_pct NUMERIC;
  v_claimed_condition device_condition;
BEGIN
  -- Only flag if condition actually changed
  IF NEW.condition_changed IS TRUE AND NEW.final_condition IS NOT NULL THEN

    SELECT claimed_condition INTO v_claimed_condition
    FROM imei_records
    WHERE id = NEW.imei_record_id;

    IF v_claimed_condition IS NOT NULL AND v_claimed_condition != NEW.final_condition THEN
      v_price_delta_pct := CASE
        WHEN NEW.price_adjustment IS NOT NULL AND NEW.price_adjustment != 0 THEN
          ABS(NEW.price_adjustment)
        ELSE NULL
      END;

      v_severity := calculate_exception_severity(
        v_claimed_condition,
        NEW.final_condition,
        v_price_delta_pct
      );

      NEW.exception_type := 'condition_mismatch';
      NEW.mismatch_severity := v_severity;
      NEW.approval_status := 'pending';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_exception_audit_record()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_claimed_condition device_condition;
BEGIN
  -- If this is a new triage result with an exception, create audit record
  IF NEW.exception_type IS NOT NULL AND NEW.approval_status = 'pending' THEN
    SELECT claimed_condition INTO v_claimed_condition
    FROM imei_records
    WHERE id = NEW.imei_record_id;

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
      'Condition discrepancy: ' || COALESCE(v_claimed_condition::TEXT, '?') || ' → ' || COALESCE(NEW.final_condition::TEXT, '?'),
      NEW.approval_status,
      NEW.triaged_by_id
    );
  END IF;

  RETURN NEW;
END;
$function$;
