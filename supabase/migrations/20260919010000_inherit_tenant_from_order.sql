-- ============================================================================
-- CHILD ROWS INHERIT tenant_id FROM THEIR ORDER (DB-level guarantee)
-- ============================================================================
-- Found 2026-09-19 while auditing the two order-creation paths:
--   * OrderService.createOrder stamps tenant_id on the ORDER but inserts
--     order_items with no tenant_id, so every line item lands on the DB
--     default (the platform tenant).
--   * /api/orders/upload-csv — the primary bulk path — inserted the ORDER
--     itself with no tenant_id, so a VAR's whole upload would belong to the
--     platform tenant.
-- Under the RESTRICTIVE tenant_isolation RLS a VAR user would then see their
-- order with no items, or no order at all. Invisible today because only the
-- platform tenant exists; would surface on the first real VAR's first order.
--
-- Rather than chase every insert site (there are eight child tables and
-- several writers), make the database the authority: on INSERT, any row that
-- references an order takes that order's tenant_id, always. The application
-- may still set it (harmlessly) — the trigger overrides with the parent's
-- value, so a mismatch is impossible by construction. Only fires when the
-- parent is found; a NULL order_id leaves the row's own value alone.
--
-- Also backfills any existing child rows whose tenant_id disagrees with their
-- order's (none expected in production today — verified 0 before applying —
-- but the statement is idempotent and cheap).

CREATE OR REPLACE FUNCTION inherit_tenant_from_order()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  parent_tenant UUID;
BEGIN
  IF NEW.order_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT tenant_id INTO parent_tenant FROM orders WHERE id = NEW.order_id;
  IF parent_tenant IS NOT NULL THEN
    NEW.tenant_id := parent_tenant;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'order_items','order_timeline','order_exceptions','shipments',
    'imei_records','triage_results','vendor_bids','sla_breaches'
  ] LOOP
    CONTINUE WHEN to_regclass('public.' || t) IS NULL;
    EXECUTE format('DROP TRIGGER IF EXISTS inherit_tenant_from_order ON %I', t);
    EXECUTE format(
      'CREATE TRIGGER inherit_tenant_from_order BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION inherit_tenant_from_order()',
      t
    );
    -- Backfill: align any existing child row with its parent order.
    EXECUTE format(
      'UPDATE %I c SET tenant_id = o.tenant_id FROM orders o WHERE c.order_id = o.id AND c.tenant_id IS DISTINCT FROM o.tenant_id',
      t
    );
  END LOOP;
END $$;
