-- ============================================================================
-- BILLING (Phase 5) — BB ↔ VAR invoices
-- 2026-08-02
--
-- New, isolated domain: invoices + line items, tenant-scoped to the VAR being
-- billed. Additive; nothing existing references these tables.
-- ============================================================================

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),          -- the VAR being billed
  invoice_number VARCHAR(30) UNIQUE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','paid','void')),
  gross_subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
  commission_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  subscription_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  total NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

CREATE TABLE IF NOT EXISTS invoice_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id),
  description TEXT NOT NULL,
  gross_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_invoice_line_items_invoice ON invoice_line_items(invoice_id);

-- ── Atomic per-year invoice numbering (concurrency-safe) ────────────────────
-- count()+1 races under load; this upsert row-locks the counter so concurrent
-- invoice creation can never collide on a number.
CREATE TABLE IF NOT EXISTS invoice_counters (
  year INT PRIMARY KEY,
  next_val INT NOT NULL DEFAULT 0
);

CREATE OR REPLACE FUNCTION next_invoice_seq(p_year INT) RETURNS INT
LANGUAGE sql AS $$
  INSERT INTO invoice_counters (year, next_val) VALUES (p_year, 1)
  ON CONFLICT (year) DO UPDATE SET next_val = invoice_counters.next_val + 1
  RETURNING next_val;
$$;

-- Counter is internal; deny all non-service access (service role bypasses RLS).
ALTER TABLE invoice_counters ENABLE ROW LEVEL SECURITY;

-- ── RLS: admins/service full access; a tenant reads its own invoices ─────────
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_line_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS invoices_admin_all ON invoices;
CREATE POLICY invoices_admin_all ON invoices FOR ALL
  USING (auth.role() = 'service_role' OR is_admin())
  WITH CHECK (auth.role() = 'service_role' OR is_admin());

DROP POLICY IF EXISTS invoices_tenant_read ON invoices;
CREATE POLICY invoices_tenant_read ON invoices FOR SELECT
  USING (tenant_id = auth_tenant_id());

DROP POLICY IF EXISTS invoice_lines_admin_all ON invoice_line_items;
CREATE POLICY invoice_lines_admin_all ON invoice_line_items FOR ALL
  USING (auth.role() = 'service_role' OR is_admin())
  WITH CHECK (auth.role() = 'service_role' OR is_admin());

DROP POLICY IF EXISTS invoice_lines_tenant_read ON invoice_line_items;
CREATE POLICY invoice_lines_tenant_read ON invoice_line_items FOR SELECT
  USING (invoice_id IN (SELECT id FROM invoices WHERE tenant_id = auth_tenant_id()));
