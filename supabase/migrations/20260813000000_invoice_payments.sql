-- ============================================================================
-- INVOICE PAYMENTS & REFUNDS (Wk10)
-- 2026-08-13
-- Payment/refund history against an invoice. Tenant reads its own via the
-- invoice; admin/service manage. Additive.
-- ============================================================================

CREATE TABLE IF NOT EXISTS invoice_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  kind VARCHAR(10) NOT NULL DEFAULT 'payment' CHECK (kind IN ('payment','refund')),
  amount NUMERIC(12,2) NOT NULL,
  note TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON invoice_payments(invoice_id);

ALTER TABLE invoice_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoice_payments_admin_all ON invoice_payments;
CREATE POLICY invoice_payments_admin_all ON invoice_payments FOR ALL
  USING (auth.role() = 'service_role' OR is_admin())
  WITH CHECK (auth.role() = 'service_role' OR is_admin());

DROP POLICY IF EXISTS invoice_payments_tenant_read ON invoice_payments;
CREATE POLICY invoice_payments_tenant_read ON invoice_payments FOR SELECT
  USING (invoice_id IN (SELECT id FROM invoices WHERE tenant_id = auth_tenant_id()));
