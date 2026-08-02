-- ============================================================================
-- SECURE IMPERSONATION — audit log (R9)
-- 2026-08-07
--
-- Records every impersonation session (who impersonated whom, when, why) for
-- compliance. Additive; the actual session-swap + UI banner are built on top of
-- this later. Admin/service only.
-- ============================================================================

CREATE TABLE IF NOT EXISTS impersonation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES users(id),       -- the admin impersonating
  target_user_id UUID NOT NULL REFERENCES users(id), -- the impersonated user
  tenant_id UUID REFERENCES tenants(id),             -- target's tenant (context)
  reason TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_impersonation_actor ON impersonation_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_impersonation_active ON impersonation_log(actor_id) WHERE ended_at IS NULL;

ALTER TABLE impersonation_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS impersonation_admin_all ON impersonation_log;
CREATE POLICY impersonation_admin_all ON impersonation_log FOR ALL
  USING (auth.role() = 'service_role' OR is_admin())
  WITH CHECK (auth.role() = 'service_role' OR is_admin());
