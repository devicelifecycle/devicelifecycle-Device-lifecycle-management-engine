-- ============================================================================
-- VAR ROLE RLS POLICIES
-- 2026-11-16
--
-- The delegated VAR roles (var_entity_admin / var_regional_manager /
-- var_sales_rep) were added to the user_role enum and the app, but no RLS
-- policy ever granted them access: customers/orders policies only admit
-- is_internal_user() (admin, coe_manager, coe_tech, sales) or the customer's
-- own organization. Under a real VAR session the customer list, VAR Import,
-- rep/region management and order lists all returned nothing.
--
-- These permissive policies admit VAR staff to rows of their OWN tenant only
-- (explicit tenant_id check, in addition to the restrictive tenant_isolation
-- policy). Region / own-customer narrowing for regional managers and sales reps
-- stays in the app layer (customerScopeFilter), as designed. Order inserts and
-- status transitions already run through the service role after the API's own
-- checks, so orders only need SELECT here; order_items / order_timeline /
-- shipments follow order visibility through their existing policies.
-- ============================================================================

CREATE OR REPLACE FUNCTION is_var_user() RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM users
    WHERE id = auth.uid()
      AND role::text IN ('var_entity_admin', 'var_regional_manager', 'var_sales_rep')
      AND is_active IS NOT FALSE
  )
$$;

-- customers ------------------------------------------------------------------
DROP POLICY IF EXISTS customers_select_var ON customers;
CREATE POLICY customers_select_var ON customers FOR SELECT
  USING (is_var_user() AND tenant_id = auth_tenant_id());

DROP POLICY IF EXISTS customers_insert_var ON customers;
CREATE POLICY customers_insert_var ON customers FOR INSERT
  WITH CHECK (is_var_user() AND tenant_id = auth_tenant_id());

DROP POLICY IF EXISTS customers_update_var ON customers;
CREATE POLICY customers_update_var ON customers FOR UPDATE
  USING (is_var_user() AND tenant_id = auth_tenant_id())
  WITH CHECK (is_var_user() AND tenant_id = auth_tenant_id());

-- orders ---------------------------------------------------------------------
DROP POLICY IF EXISTS orders_select_var ON orders;
CREATE POLICY orders_select_var ON orders FOR SELECT
  USING (is_var_user() AND tenant_id = auth_tenant_id());
