-- ============================================================================
-- PLATFORM OPERATORS PROCESS VAR ORDERS
-- 2026-11-17
--
-- Byte-Back is the processing centre for every VAR: per the client's trade-in
-- quote process spec, BB Admin reviews and releases each quote, and BB's COE
-- receives, triages, grades and pays out the devices. The RESTRICTIVE
-- tenant_isolation policy pinned BB staff to the platform tenant, so a VAR
-- order was invisible to them (GET /api/orders/{id} → 404 for admin) and no
-- VAR trade-in could ever get past 'submitted'. Found in the first real-session
-- VAR order run (PO-2026-2141).
--
-- Change: on the order-processing tables only, the restrictive policy also
-- passes an active admin / coe_manager / coe_tech whose own tenant is the
-- platform tenant. VAR users are unaffected: they stay pinned to their own
-- tenant, so one VAR still can never see another's data. Platform 'sales' and
-- 'customer'/'vendor' users are not operators and stay pinned too.
--
-- Not widened: users, organizations, notifications, audit_logs, nps_responses,
-- recurring schedules, sales_history — nothing in order processing reads those
-- across tenants through the session client.
-- ============================================================================

CREATE OR REPLACE FUNCTION is_platform_operator() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND role::text IN ('admin', 'coe_manager', 'coe_tech')
      AND tenant_id = 'a0000000-0000-4000-a000-0000000000bb'
      AND is_active IS NOT FALSE
  )
$$;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'customers',
    'orders', 'order_items', 'order_exceptions', 'order_splits', 'order_timeline',
    'imei_records', 'triage_results', 'shipments', 'vendor_bids', 'sla_breaches'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    CONTINUE WHEN to_regclass('public.' || t) IS NULL;

    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I AS RESTRICTIVE FOR ALL
      USING (
        auth.role() = 'service_role'
        OR auth_tenant_id() IS NULL
        OR tenant_id = auth_tenant_id()
        OR is_platform_operator()
      )
      WITH CHECK (
        auth.role() = 'service_role'
        OR auth_tenant_id() IS NULL
        OR tenant_id = auth_tenant_id()
        OR is_platform_operator()
      )
    $f$, t);
  END LOOP;
END $$;
