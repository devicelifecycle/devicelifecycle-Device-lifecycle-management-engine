-- ============================================================================
-- CUSTOMER REMINDERS (reseller-scheduled, sent under the VAR's name)
-- 2026-08-10
-- Tenant-scoped; additive. A cron sends the due ones via the notification service.
-- ============================================================================

CREATE TABLE IF NOT EXISTS customer_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) DEFAULT 'a0000000-0000-4000-a000-0000000000bb',
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  due_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_reminders_tenant ON customer_reminders(tenant_id);
CREATE INDEX IF NOT EXISTS idx_reminders_due ON customer_reminders(due_at) WHERE sent_at IS NULL;

ALTER TABLE customer_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS customer_reminders_rw ON customer_reminders;
CREATE POLICY customer_reminders_rw ON customer_reminders FOR ALL
  USING (auth.role() = 'service_role' OR is_admin() OR tenant_id = auth_tenant_id())
  WITH CHECK (auth.role() = 'service_role' OR is_admin() OR tenant_id = auth_tenant_id());
