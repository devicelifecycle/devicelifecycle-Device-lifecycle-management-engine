-- ============================================================================
-- CUSTOMER INVOICING — code-review fixes (2026-09-28)
-- ============================================================================
-- Three defects found reviewing the 2026-09-22 billing work:
--
--  1. The payment/refund cap was read-then-write. Two concurrent payments both
--     read the same balance, both passed, and both inserted — over-paying the
--     invoice with nothing to stop it. Identical to the bug already fixed for
--     BB→VAR invoices in 20260914030000; this mirrors that fix rather than
--     inventing a second approach.
--  2. uq_customer_invoice_lines_order ignored invoice status, so voiding an
--     invoice left its lines behind and its orders could NEVER be re-invoiced.
--     Voiding is the documented way to correct a mistake, which made the
--     correction path a dead end.
--  3. Reading one tenant's month-to-date usage ran a platform-wide GROUP BY
--     over every tenant, on every single API call.

-- ── 1. Atomic payment / refund ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION record_customer_invoice_payment(
  p_invoice_id UUID,
  p_tenant_id  UUID,
  p_kind       TEXT,
  p_amount     NUMERIC,
  p_method     TEXT,
  p_reference  TEXT,
  p_note       TEXT,
  p_created_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_total    NUMERIC;
  v_status   TEXT;
  v_paid     NUMERIC;
  v_refunded NUMERIC;
  v_net      NUMERIC;
  v_balance  NUMERIC;
  v_new_status TEXT;
BEGIN
  IF p_kind NOT IN ('payment', 'refund') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_kind');
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_amount');
  END IF;

  -- Serialize concurrent callers on this invoice row. Anyone else attempting a
  -- payment on the same invoice blocks here and then re-reads the true totals.
  -- Tenant is part of the predicate so one VAR can never touch another's row.
  SELECT total, status INTO v_total, v_status
  FROM customer_invoices
  WHERE id = p_invoice_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_status = 'void' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'void');
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN kind = 'refund' THEN 0 ELSE amount END), 0),
    COALESCE(SUM(CASE WHEN kind = 'refund' THEN amount ELSE 0 END), 0)
    INTO v_paid, v_refunded
  FROM customer_invoice_payments
  WHERE invoice_id = p_invoice_id;

  v_net := GREATEST(v_paid - v_refunded, 0);

  IF p_kind = 'refund' THEN
    IF p_amount > v_net THEN
      RETURN jsonb_build_object('ok', false, 'error', 'exceeds_net', 'max', v_net);
    END IF;
  ELSE
    v_balance := GREATEST(v_total - v_net, 0);
    IF p_amount > v_balance THEN
      RETURN jsonb_build_object('ok', false, 'error', 'exceeds_balance', 'max', v_balance);
    END IF;
  END IF;

  INSERT INTO customer_invoice_payments (invoice_id, tenant_id, kind, amount, method, reference, note, created_by)
  VALUES (p_invoice_id, p_tenant_id, p_kind, p_amount, p_method, p_reference, p_note, p_created_by);

  -- Recompute from the rows we just committed, inside the same lock.
  v_net := GREATEST(
    v_net + CASE WHEN p_kind = 'refund' THEN -p_amount ELSE p_amount END, 0);
  v_balance := GREATEST(v_total - v_net, 0);

  -- Only legal transitions: a draft stays a draft (it was never issued), and a
  -- settled invoice becomes paid only from 'sent'. Re-opening a paid invoice
  -- after a refund returns it to 'sent', never to 'draft'.
  v_new_status := v_status;
  IF v_balance <= 0 AND v_total > 0 AND v_status = 'sent' THEN
    v_new_status := 'paid';
  ELSIF v_balance > 0 AND v_status = 'paid' THEN
    v_new_status := 'sent';
  END IF;

  IF v_new_status <> v_status THEN
    UPDATE customer_invoices
      SET status = v_new_status, updated_at = NOW()
      WHERE id = p_invoice_id AND tenant_id = p_tenant_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'status', v_new_status, 'total', v_total,
    'net_paid', v_net, 'balance', v_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION record_customer_invoice_payment(UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION record_customer_invoice_payment(UUID, UUID, TEXT, NUMERIC, TEXT, TEXT, TEXT, UUID) TO service_role;

-- ── 2. A voided invoice must release its orders ─────────────────────────────
-- The index now covers only lines belonging to invoices that are not void, so
-- voiding an invoice frees its orders to be billed again.
DROP INDEX IF EXISTS uq_customer_invoice_lines_order;

CREATE OR REPLACE FUNCTION customer_invoice_line_is_live(p_invoice_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT COALESCE((SELECT status <> 'void' FROM customer_invoices WHERE id = p_invoice_id), true);
$$;

-- A partial unique index can't call a subquery, so the guarantee is enforced by
-- a trigger instead: one LIVE (non-void) line per order per tenant.
CREATE OR REPLACE FUNCTION customer_invoice_line_no_double_bill()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.order_id IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (
    SELECT 1
    FROM customer_invoice_line_items l
    JOIN customer_invoices i ON i.id = l.invoice_id
    WHERE l.tenant_id = NEW.tenant_id
      AND l.order_id = NEW.order_id
      AND l.invoice_id <> NEW.invoice_id
      AND i.status <> 'void'
  ) THEN
    RAISE EXCEPTION 'order % is already on a live invoice for this tenant', NEW.order_id
      USING ERRCODE = 'unique_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customer_invoice_line_no_double_bill ON customer_invoice_line_items;
CREATE TRIGGER customer_invoice_line_no_double_bill
  BEFORE INSERT ON customer_invoice_line_items
  FOR EACH ROW EXECUTE FUNCTION customer_invoice_line_no_double_bill();

-- ── 3. One tenant's usage without scanning every tenant ─────────────────────
CREATE OR REPLACE FUNCTION tenant_usage_month_one(
  p_tenant_id UUID,
  p_month_start DATE DEFAULT date_trunc('month', (NOW() AT TIME ZONE 'UTC'))::date
)
RETURNS TABLE (api_calls BIGINT, ai_tokens BIGINT)
LANGUAGE sql SECURITY INVOKER STABLE AS $$
  SELECT COALESCE(SUM(api_calls), 0)::bigint, COALESCE(SUM(ai_tokens), 0)::bigint
  FROM tenant_usage_daily
  WHERE tenant_id = p_tenant_id
    AND day >= p_month_start
    AND day < (p_month_start + INTERVAL '1 month')::date;
$$;

REVOKE ALL ON FUNCTION tenant_usage_month_one(UUID, DATE) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tenant_usage_month_one(UUID, DATE) TO service_role;

CREATE OR REPLACE FUNCTION tenant_storage_bytes_one(p_tenant_id UUID)
RETURNS BIGINT
LANGUAGE sql SECURITY DEFINER SET search_path = public, storage STABLE AS $$
  SELECT COALESCE(SUM((so.metadata->>'size')::bigint), 0)::bigint
  FROM storage.objects so
  JOIN organizations o
    ON so.bucket_id = 'uploads'
   AND split_part(so.name, '/', 1) = 'customer-orders'
   AND split_part(so.name, '/', 2) = o.id::text
  WHERE o.tenant_id = p_tenant_id;
$$;

REVOKE ALL ON FUNCTION tenant_storage_bytes_one(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION tenant_storage_bytes_one(UUID) TO service_role;
