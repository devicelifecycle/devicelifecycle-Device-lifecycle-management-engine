-- ============================================================================
-- RECORD INVOICE PAYMENT — atomic refund cap
-- 2026-09-14
--
-- The refund cap in POST /api/admin/billing/[id]/payments was read-then-insert:
-- it summed existing rows, checked the new refund against the net paid, then
-- inserted. Two refunds issued at the same moment both read the same net, both
-- passed, and both inserted — over-refunding the invoice with nothing to stop
-- it. Real money, and invisible afterwards.
--
-- This does the check and the insert in one statement, serialized on the
-- invoice row, so a concurrent caller waits and then re-reads the true total.
-- ============================================================================

CREATE OR REPLACE FUNCTION record_invoice_payment(
  p_invoice_id UUID,
  p_kind       TEXT,
  p_amount     NUMERIC,
  p_note       TEXT,
  p_created_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_paid     NUMERIC;
  v_refunded NUMERIC;
  v_net      NUMERIC;
BEGIN
  IF p_kind NOT IN ('payment', 'refund') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_kind');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  -- Serialize concurrent calls for this invoice. Everything below reads a
  -- consistent view because any other caller blocks here until we commit.
  PERFORM 1 FROM invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF p_kind = 'refund' THEN
    SELECT
      COALESCE(SUM(CASE WHEN kind = 'refund' THEN 0 ELSE amount END), 0),
      COALESCE(SUM(CASE WHEN kind = 'refund' THEN amount ELSE 0 END), 0)
      INTO v_paid, v_refunded
    FROM invoice_payments
    WHERE invoice_id = p_invoice_id;

    v_net := v_paid - v_refunded;
    IF p_amount > v_net THEN
      RETURN jsonb_build_object('ok', false, 'error', 'exceeds_net', 'net', v_net);
    END IF;
  END IF;

  INSERT INTO invoice_payments (invoice_id, kind, amount, note, created_by)
  VALUES (p_invoice_id, p_kind, p_amount, p_note, p_created_by);

  RETURN jsonb_build_object('ok', true);
END;
$$;
