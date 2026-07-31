-- ============================================================================
-- TENANT ISOLATION RLS (finishes Phase 1)
-- 2026-08-01
--
-- Adds a RESTRICTIVE tenant_isolation policy to every tenant-scoped table.
-- Restrictive policies are AND-ed with the existing (permissive) role policies,
-- so this can only NARROW access, never widen it — the current role-based
-- behavior is preserved.
--
-- Why it's a no-op today: every existing row and every existing user lives on
-- the Byte-Back platform tenant, so `tenant_id = auth_tenant_id()` is always
-- true. Once VAR users/data exist, they are isolated automatically.
--
-- Perf: auth_tenant_id() is STABLE, so Postgres evaluates it once per statement
-- (not per row). No measurable overhead on current queries.
--
-- Note: the policy is created on all 20 tables, but only enforced where RLS is
-- already enabled. Tables without RLS keep the (inert) policy for when full
-- isolation is switched on. When the app provisions VAR data it must set
-- tenant_id explicitly on INSERT (the WITH CHECK requires a matching tenant).
-- ============================================================================

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'users','organizations','customers','vendors',
    'orders','order_items','order_exceptions','order_splits','order_timeline',
    'imei_records','triage_results','shipments','vendor_bids',
    'notifications','notification_attempts','nps_responses',
    'recurring_trade_in_schedules','audit_logs','sla_breaches','sales_history'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Skip tables that don't exist in this environment.
    CONTINUE WHEN to_regclass('public.' || t) IS NULL;

    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I AS RESTRICTIVE FOR ALL
      USING (
        auth.role() = 'service_role'
        OR auth_tenant_id() IS NULL
        OR tenant_id = auth_tenant_id()
      )
      WITH CHECK (
        auth.role() = 'service_role'
        OR auth_tenant_id() IS NULL
        OR tenant_id = auth_tenant_id()
      )
    $f$, t);
  END LOOP;
END $$;
