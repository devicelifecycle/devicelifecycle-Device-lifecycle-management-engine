-- ============================================================================
-- customer_billing.manage — a VAR invoicing its own end customers (Option B)
-- 2026-11-17
--
-- Mirrors src/lib/permissions.ts. Option B create/send/pay was gated on
-- billing.manage, which no VAR role holds (it gates BB's invoices to VARs), so
-- the VAR entity admin could switch Option B on but never raise an invoice.
-- Granted to the var_entity_admin template and the platform admin role.
-- ============================================================================

INSERT INTO permissions (key, resource, action, description) VALUES
  ('customer_billing.manage', 'customer_billing', 'manage', 'Raise, send and take payment on own customer invoices (VAR Option B)')
ON CONFLICT (key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.key = 'customer_billing.manage'
WHERE r.key IN ('var_entity_admin', 'admin') AND r.tenant_id = 'a0000000-0000-4000-a000-0000000000bb'
ON CONFLICT DO NOTHING;
