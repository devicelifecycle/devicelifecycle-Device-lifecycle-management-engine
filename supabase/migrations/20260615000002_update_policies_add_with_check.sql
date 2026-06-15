-- Add explicit WITH CHECK to all UPDATE policies that previously relied on the
-- PostgreSQL fallback (when WITH CHECK is absent, USING is reused for post-update
-- verification).  The behaviour is identical; this makes the intent explicit and
-- closes the class of bugs where a future USING change silently loosens write guards.

ALTER POLICY organizations_update_admin ON organizations
  WITH CHECK (is_admin());

ALTER POLICY users_update_admin ON users
  WITH CHECK (is_admin() OR auth.uid() = id);

ALTER POLICY customers_update ON customers
  WITH CHECK (is_internal_user());

ALTER POLICY vendors_update ON vendors
  WITH CHECK (is_internal_user());

ALTER POLICY device_catalog_update ON device_catalog
  WITH CHECK (is_admin() OR get_user_role() = 'coe_manager');

ALTER POLICY pricing_update ON pricing_tables
  WITH CHECK (is_admin());

ALTER POLICY orders_update ON orders
  WITH CHECK (is_internal_user());

ALTER POLICY order_items_update ON order_items
  WITH CHECK (is_internal_user());

ALTER POLICY imei_update ON imei_records
  WITH CHECK (is_internal_user());

ALTER POLICY shipments_update ON shipments
  WITH CHECK (is_internal_user());

ALTER POLICY triage_update ON triage_results
  WITH CHECK (is_internal_user());

ALTER POLICY notifications_update_own ON notifications
  WITH CHECK (user_id = auth.uid());

ALTER POLICY vendor_bids_update ON vendor_bids
  WITH CHECK (is_internal_user() OR get_user_role() = 'vendor');
