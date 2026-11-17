-- ============================================================================
-- ASSIGNED VENDOR CAN WORK A VAR'S CPO ORDER
-- 2026-11-17
--
-- Vendors are platform-tenant users. A VAR's CPO order (tenant = the VAR) was
-- broadcast to them for bidding and the winning bid assigned it, but the
-- RESTRICTIVE tenant_isolation policy then hid the order from that vendor:
-- uploading tracking answered "You can only create shipments for your own
-- assigned orders" and every vendor status step 404'd. Found in the first
-- real-session VAR CPO run (INV-2026-2035).
--
-- Change: on orders, the restrictive policy also passes a row whose vendor_id
-- belongs to the caller's vendor organization; on order_items, shipments and
-- order_timeline, a row whose order is assigned to it. Nothing else of the VAR
-- (its customers, other orders) becomes visible. Recreates the policies from
-- 20261117000000 on these four tables with the vendor clause added.
-- ============================================================================

CREATE OR REPLACE FUNCTION is_vendor_of(p_vendor_id uuid) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p_vendor_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM vendors v JOIN users u ON u.organization_id = v.organization_id
    WHERE v.id = p_vendor_id
      AND u.id = auth.uid()
      AND u.role::text = 'vendor'
      AND u.is_active IS NOT FALSE
  )
$$;

CREATE OR REPLACE FUNCTION is_assigned_vendor_order(p_order_id uuid) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM orders o WHERE o.id = p_order_id AND is_vendor_of(o.vendor_id)
  )
$$;

DROP POLICY IF EXISTS tenant_isolation ON orders;
CREATE POLICY tenant_isolation ON orders AS RESTRICTIVE FOR ALL
USING (
  auth.role() = 'service_role' OR auth_tenant_id() IS NULL OR tenant_id = auth_tenant_id()
  OR is_platform_operator() OR is_vendor_of(vendor_id)
)
WITH CHECK (
  auth.role() = 'service_role' OR auth_tenant_id() IS NULL OR tenant_id = auth_tenant_id()
  OR is_platform_operator() OR is_vendor_of(vendor_id)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['order_items', 'shipments', 'order_timeline'] LOOP
    CONTINUE WHEN to_regclass('public.' || t) IS NULL;
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format($f$
      CREATE POLICY tenant_isolation ON %I AS RESTRICTIVE FOR ALL
      USING (
        auth.role() = 'service_role' OR auth_tenant_id() IS NULL OR tenant_id = auth_tenant_id()
        OR is_platform_operator() OR is_assigned_vendor_order(order_id)
      )
      WITH CHECK (
        auth.role() = 'service_role' OR auth_tenant_id() IS NULL OR tenant_id = auth_tenant_id()
        OR is_platform_operator() OR is_assigned_vendor_order(order_id)
      )
    $f$, t);
  END LOOP;
END $$;
