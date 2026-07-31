-- ============================================================================
-- POST-MIGRATION VERIFICATION — VAR platform
-- Run read-only after `supabase db push`. Nothing here mutates data.
-- ============================================================================

-- 1. The Byte-Back platform tenant exists and is the platform type.
SELECT id, name, slug, type, is_active
FROM tenants
WHERE id = 'a0000000-0000-4000-a000-0000000000bb';

-- 2. No tenant-scoped row was left without a tenant_id (backfill sanity).
--    Every count must be 0.
SELECT 'users' AS table, count(*) AS null_tenant FROM users WHERE tenant_id IS NULL
UNION ALL SELECT 'organizations', count(*) FROM organizations WHERE tenant_id IS NULL
UNION ALL SELECT 'customers', count(*) FROM customers WHERE tenant_id IS NULL
UNION ALL SELECT 'orders', count(*) FROM orders WHERE tenant_id IS NULL
UNION ALL SELECT 'order_items', count(*) FROM order_items WHERE tenant_id IS NULL
UNION ALL SELECT 'shipments', count(*) FROM shipments WHERE tenant_id IS NULL
UNION ALL SELECT 'imei_records', count(*) FROM imei_records WHERE tenant_id IS NULL
UNION ALL SELECT 'audit_logs', count(*) FROM audit_logs WHERE tenant_id IS NULL
ORDER BY 1;

-- 3. The restrictive tenant_isolation policy is present on the scoped tables.
--    permissive = 'RESTRICTIVE' expected for each.
SELECT tablename, policyname, permissive, cmd
FROM pg_policies
WHERE policyname = 'tenant_isolation'
ORDER BY tablename;

-- 4. RBAC seed: 6 system roles + 28 permissions on the platform tenant.
SELECT (SELECT count(*) FROM roles WHERE is_system) AS system_roles,
       (SELECT count(*) FROM permissions)           AS permissions,
       (SELECT count(*) FROM user_roles)            AS user_role_links;

-- 5. Billing objects exist and the counter function is callable.
SELECT to_regclass('public.invoices')          AS invoices_tbl,
       to_regclass('public.invoice_line_items') AS line_items_tbl,
       to_regclass('public.invoice_counters')   AS counters_tbl;
