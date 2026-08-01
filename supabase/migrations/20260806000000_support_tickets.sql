-- ============================================================================
-- SUPPORT TICKETS (R3)
-- 2026-08-06
--
-- Tenant-scoped tickets + threaded messages. Additive; nothing existing depends
-- on these. RLS keeps each tenant to its own tickets; admins/service see all.
-- ============================================================================

CREATE TABLE IF NOT EXISTS tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) DEFAULT 'a0000000-0000-4000-a000-0000000000bb',
  customer_id UUID REFERENCES customers(id),
  subject VARCHAR(200) NOT NULL,
  status VARCHAR(15) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_progress','resolved','closed')),
  priority VARCHAR(10) NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low','normal','high','urgent')),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tickets_tenant ON tickets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);

CREATE TABLE IF NOT EXISTS ticket_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id UUID REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON ticket_messages(ticket_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tickets_rw ON tickets;
CREATE POLICY tickets_rw ON tickets FOR ALL
  USING (auth.role() = 'service_role' OR is_admin() OR tenant_id = auth_tenant_id())
  WITH CHECK (auth.role() = 'service_role' OR is_admin() OR tenant_id = auth_tenant_id());

DROP POLICY IF EXISTS ticket_messages_rw ON ticket_messages;
CREATE POLICY ticket_messages_rw ON ticket_messages FOR ALL
  USING (
    auth.role() = 'service_role' OR is_admin()
    OR ticket_id IN (SELECT id FROM tickets WHERE tenant_id = auth_tenant_id())
  )
  WITH CHECK (
    auth.role() = 'service_role' OR is_admin()
    OR ticket_id IN (SELECT id FROM tickets WHERE tenant_id = auth_tenant_id())
  );
