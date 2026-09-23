-- ============================================================================
-- VAR → END-CUSTOMER INVOICING (Billing "Option B")
-- ============================================================================
-- The outline's VAR Billing section framed two options, open since 2026-08-17:
--   A) the VAR bills its own customer outside our platform (already supported —
--      nothing in the product needs to change for it), and
--   B) Byte-Back provides in-platform invoicing FOR the VAR to bill their
--      customer.
-- Client answer 2026-09-22: BOTH. So B is built here as an opt-in mode, and A
-- stays the default so no existing tenant's behaviour changes.
--
-- Deliberately a SEPARATE table from `invoices`. That one means "BB billing the
-- VAR its commission" (tenant_id = the VAR being billed, with commission and
-- subscription_fee columns). A VAR→customer invoice is a different party pair
-- and different money; putting both in one table is how a VAR's commission bill
-- from Byte-Back would end up listed in their own customer-billing screen.
--
-- Payment COLLECTION is deliberately absent: the gateway decision is still
-- deferred (Open decisions). Payments are recorded manually here, exactly as
-- the BB→VAR invoices already work, so the balance is real without pretending
-- we can charge a card.

CREATE TABLE IF NOT EXISTS customer_invoices (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,   -- the VAR issuing it
  customer_id    UUID NOT NULL REFERENCES customers(id) ON DELETE RESTRICT, -- who is billed
  invoice_number VARCHAR(40),
  status         VARCHAR(10) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','paid','void')),
  issue_date     DATE NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')::date,
  due_date       DATE,
  subtotal       NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_rate       NUMERIC(6,5)  NOT NULL DEFAULT 0,
  tax_label      TEXT,
  tax_amount     NUMERIC(12,2) NOT NULL DEFAULT 0,
  total          NUMERIC(12,2) NOT NULL DEFAULT 0,
  currency       VARCHAR(3) NOT NULL DEFAULT 'CAD',
  notes          TEXT,
  sent_at        TIMESTAMPTZ,
  created_by     UUID REFERENCES users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Invoice numbers are unique per issuing VAR, not globally: two VARs each
  -- running their own books will both want INV-2026-0001.
  UNIQUE (tenant_id, invoice_number)
);
CREATE INDEX IF NOT EXISTS idx_customer_invoices_tenant ON customer_invoices(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customer_invoices_customer ON customer_invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_invoices_status ON customer_invoices(tenant_id, status);

CREATE TABLE IF NOT EXISTS customer_invoice_line_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  UUID NOT NULL REFERENCES customer_invoices(id) ON DELETE CASCADE,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id    UUID REFERENCES orders(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity    INTEGER NOT NULL DEFAULT 1,
  unit_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customer_invoice_lines_invoice ON customer_invoice_line_items(invoice_id);
-- One invoice per order per VAR: re-running "bill uncharged orders" must not
-- silently double-bill a customer for the same order.
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_invoice_lines_order
  ON customer_invoice_line_items(tenant_id, order_id) WHERE order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS customer_invoice_payments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES customer_invoices(id) ON DELETE CASCADE,
  tenant_id  UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  kind       VARCHAR(10) NOT NULL DEFAULT 'payment' CHECK (kind IN ('payment','refund')),
  amount     NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method     VARCHAR(40),
  reference  TEXT,
  note       TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customer_invoice_payments_invoice ON customer_invoice_payments(invoice_id);

-- ── Per-tenant, per-year invoice numbering (concurrency-safe) ────────────────
-- Same reasoning as next_invoice_seq for BB invoices: count()+1 races under
-- concurrent issue, so the counter row is locked by the upsert.
CREATE TABLE IF NOT EXISTS customer_invoice_counters (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  year      INT  NOT NULL,
  next_val  INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (tenant_id, year)
);
ALTER TABLE customer_invoice_counters ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION next_customer_invoice_seq(p_tenant_id UUID, p_year INT)
RETURNS INT LANGUAGE sql SECURITY INVOKER AS $$
  INSERT INTO customer_invoice_counters (tenant_id, year, next_val)
  VALUES (p_tenant_id, p_year, 1)
  ON CONFLICT (tenant_id, year)
    DO UPDATE SET next_val = customer_invoice_counters.next_val + 1
  RETURNING next_val;
$$;
REVOKE ALL ON FUNCTION next_customer_invoice_seq(UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION next_customer_invoice_seq(UUID, INT) TO service_role;

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Service role (the API) does the work; a tenant's users read their own; the
-- billed customer's own users read theirs. Nobody writes directly.
ALTER TABLE customer_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_invoice_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_invoices_tenant_read ON customer_invoices;
CREATE POLICY customer_invoices_tenant_read ON customer_invoices FOR SELECT
  USING (tenant_id = auth_tenant_id());

DROP POLICY IF EXISTS customer_invoice_lines_tenant_read ON customer_invoice_line_items;
CREATE POLICY customer_invoice_lines_tenant_read ON customer_invoice_line_items FOR SELECT
  USING (tenant_id = auth_tenant_id());

DROP POLICY IF EXISTS customer_invoice_payments_tenant_read ON customer_invoice_payments;
CREATE POLICY customer_invoice_payments_tenant_read ON customer_invoice_payments FOR SELECT
  USING (tenant_id = auth_tenant_id());
