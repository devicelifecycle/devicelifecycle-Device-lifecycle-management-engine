-- ============================================================================
-- COMPOSITE INDEXES FOR PERFORMANCE
-- ============================================================================
-- Adds composite indexes for common query patterns to improve performance
-- as data scales. These cover frequent filter/sort combinations.

-- ============================================================================
-- ORDER QUERIES
-- ============================================================================

-- Customer order history (filtered by status, sorted by date)
create index if not exists idx_orders_customer_status_date
  on orders(customer_id, status, created_at desc);

-- Vendor order assignments
create index if not exists idx_orders_vendor_status_date
  on orders(vendor_id, status, created_at desc);

-- Order assignment tracking
create index if not exists idx_orders_assigned_status
  on orders(assigned_to_id, status) where assigned_to_id is not null;

-- Order SLA breach monitoring
create index if not exists idx_orders_sla_breach
  on orders(is_sla_breached, status, created_at desc) where is_sla_breached = true;

-- ============================================================================
-- ORDER TIMELINE
-- ============================================================================

-- Order status history (for timeline views)
create index if not exists idx_order_timeline_order_date
  on order_timeline(order_id, created_at desc);

-- ============================================================================
-- IMEI RECORDS
-- ============================================================================

-- IMEI tracking workflow (order-specific with triage status)
create index if not exists idx_imei_records_order_triage
  on imei_records(order_id, triage_status, created_at desc);

-- IMEI lookups by serial/device
create index if not exists idx_imei_records_device_status
  on imei_records(device_id, current_status);

-- ============================================================================
-- DEVICE CATALOG
-- ============================================================================

-- Device catalog browsing (by category, active only)
create index if not exists idx_device_catalog_category_active
  on device_catalog(category, is_active);

-- Device search by make/model
create index if not exists idx_device_catalog_make_model
  on device_catalog(make, model) where is_active = true;

-- ============================================================================
-- PRICING TABLES
-- ============================================================================

-- Pricing lookups by device and condition
create index if not exists idx_pricing_tables_device_condition
  on pricing_tables(device_id, condition, is_active);

-- Active pricing effective date range
create index if not exists idx_pricing_tables_effective
  on pricing_tables(effective_date desc, expiry_date) where is_active = true;

-- ============================================================================
-- TRIAGE RESULTS
-- ============================================================================

-- Triage results by order and decision
create index if not exists idx_triage_results_order_decision
  on triage_results(order_id, decision, created_at desc);

-- ============================================================================
-- SHIPMENTS
-- ============================================================================

-- Shipment tracking by order
create index if not exists idx_shipments_order_type
  on shipments(order_id, type, status);

-- Active shipments monitoring
create index if not exists idx_shipments_status_date
  on shipments(status, expected_delivery_date)
  where status not in ('delivered', 'cancelled');

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================

-- User notifications (unread priority)
create index if not exists idx_notifications_user_unread
  on notifications(user_id, is_read, created_at desc);

-- Priority notifications
create index if not exists idx_notifications_priority
  on notifications(priority desc, created_at desc) where is_read = false;

-- ============================================================================
-- AUDIT LOGS
-- ============================================================================

-- Audit trail by entity
create index if not exists idx_audit_logs_entity
  on audit_logs(entity_type, entity_id, created_at desc);

-- User activity tracking
create index if not exists idx_audit_logs_user_action
  on audit_logs(user_id, action, created_at desc);

-- ============================================================================
-- SLA TRACKING
-- ============================================================================

-- SLA breaches by order
create index if not exists idx_sla_breaches_order
  on sla_breaches(order_id, breach_time desc);

-- Active breaches monitoring
create index if not exists idx_sla_breaches_resolved
  on sla_breaches(resolved_at, breach_time desc) where resolved_at is null;

-- ============================================================================
-- VENDOR BIDS
-- ============================================================================

-- Vendor bids by order
create index if not exists idx_vendor_bids_order_status
  on vendor_bids(order_id, status, created_at desc);
