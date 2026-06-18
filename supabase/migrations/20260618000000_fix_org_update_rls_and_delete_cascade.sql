-- Two fixes for organization management:
--
-- 1. organizations_update_admin RLS only allowed is_admin(), but the app's
--    PATCH /api/organizations/[id] route has always permitted admin OR
--    coe_manager. RLS silently overruled the app, so coe_manager updates
--    (rename, phone/email change, etc.) appeared to do nothing. Align RLS
--    with the intended app-level permission.
--
-- 2. delete_organization_cascade() only deleted dependents tied to one of
--    the org's own orders. A vendor's bid on someone else's order, or an
--    IMEI record sourced from this vendor on an order outside this org,
--    referenced vendors(id) with no ON DELETE action — so deleting an
--    organization with such a vendor failed with a foreign key violation
--    and silently rolled back (looked like "delete does nothing").

ALTER POLICY organizations_update_admin ON organizations
  USING (is_admin() OR get_user_role() = 'coe_manager')
  WITH CHECK (is_admin() OR get_user_role() = 'coe_manager');

CREATE OR REPLACE FUNCTION delete_organization_cascade()
RETURNS TRIGGER AS $$
DECLARE
  order_ids UUID[];
  vendor_ids UUID[];
BEGIN
  SELECT array_agg(id) INTO vendor_ids FROM vendors WHERE organization_id = OLD.id;

  SELECT array_agg(DISTINCT o.id) INTO order_ids
  FROM orders o
  LEFT JOIN customers c ON o.customer_id = c.id AND c.organization_id = OLD.id
  LEFT JOIN vendors v ON o.vendor_id = v.id AND v.organization_id = OLD.id
  WHERE c.id IS NOT NULL OR v.id IS NOT NULL;

  IF order_ids IS NOT NULL AND array_length(order_ids, 1) > 0 THEN
    DELETE FROM triage_results WHERE order_id = ANY(order_ids);
    DELETE FROM imei_records WHERE order_id = ANY(order_ids);
    DELETE FROM sla_breaches WHERE order_id = ANY(order_ids);
    DELETE FROM shipments WHERE order_id = ANY(order_ids);
    DELETE FROM orders WHERE id = ANY(order_ids);
  END IF;

  IF vendor_ids IS NOT NULL AND array_length(vendor_ids, 1) > 0 THEN
    -- References to this org's vendors that live on orders OUTSIDE this org
    -- (bids placed on other orgs' orders, IMEI records sourced from this
    -- vendor for unrelated orders) — must be cleared before the vendor rows
    -- below can be deleted.
    DELETE FROM vendor_bids WHERE vendor_id = ANY(vendor_ids);
    UPDATE imei_records SET source_vendor_id = NULL WHERE source_vendor_id = ANY(vendor_ids);
  END IF;

  DELETE FROM customers WHERE organization_id = OLD.id;
  DELETE FROM vendors WHERE organization_id = OLD.id;
  UPDATE users SET organization_id = NULL WHERE organization_id = OLD.id;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;
