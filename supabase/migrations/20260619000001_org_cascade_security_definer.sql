-- delete_organization_cascade() runs DELETEs against customers, vendors,
-- orders, triage_results, imei_records, sla_breaches, shipments, and
-- vendor_bids — none of which have a FOR DELETE RLS policy. Because the
-- function wasn't SECURITY DEFINER, those internal deletes ran as the
-- invoking (RLS-bound) user and silently affected 0 rows, leaving e.g. the
-- customers row in place. The outer DELETE FROM organizations then hit
-- customers_organization_id_fkey. Mark it SECURITY DEFINER — same pattern
-- already used by is_admin()/is_internal_user()/get_user_role() in this
-- schema — so the cascade actually runs with the privileges needed to
-- clean up, regardless of RLS policies on the dependent tables.

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
    DELETE FROM vendor_bids WHERE vendor_id = ANY(vendor_ids);
    UPDATE imei_records SET source_vendor_id = NULL WHERE source_vendor_id = ANY(vendor_ids);
  END IF;

  DELETE FROM customers WHERE organization_id = OLD.id;
  DELETE FROM vendors WHERE organization_id = OLD.id;
  UPDATE users SET organization_id = NULL WHERE organization_id = OLD.id;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
