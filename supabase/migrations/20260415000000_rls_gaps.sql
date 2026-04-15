-- ============================================================================
-- RLS GAPS — fill missing INSERT/DELETE policies on order_exceptions,
-- and add service_role bypass for all new tables that lack it.
-- ============================================================================

-- ── order_exceptions: INSERT (COE tech/manager/admin + service_role) ────────
CREATE POLICY order_exceptions_insert ON order_exceptions FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR (SELECT role FROM users WHERE id = auth.uid()) IN ('admin', 'coe_manager', 'coe_tech')
  );

-- ── order_exceptions: DELETE (admin only) ────────────────────────────────────
CREATE POLICY order_exceptions_delete ON order_exceptions FOR DELETE
  USING (
    auth.role() = 'service_role'
    OR (SELECT role FROM users WHERE id = auth.uid()) = 'admin'
  );

-- ── order_splits: service_role bypass (currently only authenticated policies) ──
CREATE POLICY order_splits_service_role ON order_splits FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── trained_pricing_baselines / trained_condition_multipliers: service_role ──
-- These are written by the training cron (service_role). The existing policy
-- allows internal users to manage them but doesn't explicitly cover service_role.
CREATE POLICY trained_baselines_service_role ON trained_pricing_baselines FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY trained_multipliers_service_role ON trained_condition_multipliers FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── sla_breaches: ensure service_role can SELECT (cron reads for escalation) ──
CREATE POLICY sla_breaches_service_role ON sla_breaches FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
