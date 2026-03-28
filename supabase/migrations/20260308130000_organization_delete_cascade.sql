-- When an organization is deleted, cascade delete related data.
-- Order: clean up orders (and their dependents), then customers, vendors, unlink users.

CREATE OR REPLACE FUNCTION delete_organization_cascade()
RETURNS TRIGGER AS $$
DECLARE
  order_ids UUID[];
BEGIN
  -- Collect order IDs to delete (orders for customers or vendors in this org)
  SELECT array_agg(DISTINCT o.id) INTO order_ids
  FROM orders o
  LEFT JOIN customers c ON o.customer_id = c.id AND c.organization_id = OLD.id
  LEFT JOIN vendors v ON o.vendor_id = v.id AND v.organization_id = OLD.id
  WHERE c.id IS NOT NULL OR v.id IS NOT NULL;

  IF order_ids IS NOT NULL AND array_length(order_ids, 1) > 0 THEN
    -- Delete dependents that don't have ON DELETE CASCADE
    DELETE FROM triage_results WHERE order_id = ANY(order_ids);
    DELETE FROM imei_records WHERE order_id = ANY(order_ids);
    DELETE FROM sla_breaches WHERE order_id = ANY(order_ids);
    DELETE FROM shipments WHERE order_id = ANY(order_ids);
    -- Now delete orders (order_items, order_timeline, vendor_bids have CASCADE)
    DELETE FROM orders WHERE id = ANY(order_ids);
  END IF;

  DELETE FROM customers WHERE organization_id = OLD.id;
  DELETE FROM vendors WHERE organization_id = OLD.id;
  UPDATE users SET organization_id = NULL WHERE organization_id = OLD.id;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_delete_organization_cascade ON organizations;
CREATE TRIGGER trigger_delete_organization_cascade
  BEFORE DELETE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION delete_organization_cascade();
