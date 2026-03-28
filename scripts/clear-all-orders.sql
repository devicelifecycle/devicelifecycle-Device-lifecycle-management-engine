-- Clear all orders and related data
-- Run with: supabase db execute --file scripts/clear-all-orders.sql
-- Or: psql $DATABASE_URL -f scripts/clear-all-orders.sql

BEGIN;

-- Delete child records that reference orders (no ON DELETE CASCADE)
DELETE FROM triage_results WHERE order_id IN (SELECT id FROM orders);
DELETE FROM imei_records WHERE order_id IN (SELECT id FROM orders);
DELETE FROM sla_breaches WHERE order_id IN (SELECT id FROM orders);
DELETE FROM vendor_bids WHERE order_id IN (SELECT id FROM orders);

-- Delete order_splits (references parent/sub orders)
DELETE FROM order_splits WHERE parent_order_id IN (SELECT id FROM orders) OR sub_order_id IN (SELECT id FROM orders);

-- sales_history may reference orders
DELETE FROM sales_history WHERE order_id IN (SELECT id FROM orders);

-- shipments and order_timeline reference orders (may not CASCADE in all setups)
DELETE FROM shipments WHERE order_id IN (SELECT id FROM orders);
DELETE FROM order_timeline WHERE order_id IN (SELECT id FROM orders);

-- Clear all notifications (many reference orders via metadata)
DELETE FROM notifications;

-- Delete all orders (cascades to order_items)
DELETE FROM orders;

COMMIT;
