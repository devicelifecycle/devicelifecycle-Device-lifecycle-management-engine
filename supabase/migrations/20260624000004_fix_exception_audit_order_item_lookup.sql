-- ============================================================================
-- FIX: create_exception_audit_record() selected order_item_id FROM
-- triage_results, but that column does not exist on this database's
-- triage_results table (order_item_id lives on imei_records). This was
-- masked until now by the MIN(uuid) bug fixed in the previous migration —
-- once that was fixed, this became the next failure on any real condition
-- mismatch (exception) path.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_exception_audit_record()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_claimed_condition device_condition;
  v_order_item_id uuid;
BEGIN
  IF NEW.exception_type IS NOT NULL AND NEW.approval_status = 'pending' THEN
    SELECT claimed_condition, order_item_id INTO v_claimed_condition, v_order_item_id
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
