-- ============================================================================
-- DELEGATED VAR ROLES (Appendix A — N-level hierarchy)
-- 2026-08-03
--
-- Adds VAR sub-role templates so a VAR Entity can delegate down to Regional
-- Manager and Sales Rep without ever exceeding BB-granted privileges. Seeded as
-- system template roles on the platform tenant; VAR provisioning clones them.
-- Fully additive — no existing role/permission changes.
-- ============================================================================

-- New scoped permission: a VAR sets its OWN corp/rep margins (distinct from
-- BB's commission.manage, which stays platform-admin only).
INSERT INTO permissions (key, resource, action, description) VALUES
  ('commission.var_margins','commission','var_margins','Set own VAR corp/rep margins')
ON CONFLICT (key) DO NOTHING;

-- Delegated role templates (Appendix A levels 2–4).
INSERT INTO roles (tenant_id, key, name, description, is_system) VALUES
  ('a0000000-0000-4000-a000-0000000000bb','var_entity_admin','VAR Entity Admin','White-label settings, reps, margins, tenant reporting',true),
  ('a0000000-0000-4000-a000-0000000000bb','var_regional_manager','VAR Regional Manager','Regional reps, regional margins + reporting',true),
  ('a0000000-0000-4000-a000-0000000000bb','var_sales_rep','VAR Sales Rep','Own customer management + performance reporting',true)
ON CONFLICT (tenant_id, key) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.key IN ('tenant.view','user.create','user.update','user.view',
               'customer.create','customer.update','customer.delete','customer.view',
               'order.create','order.update','order.view',
               'pricing.view','commission.view','commission.var_margins',
               'billing.view','reports.view','audit.view')
WHERE r.key = 'var_entity_admin' AND r.tenant_id = 'a0000000-0000-4000-a000-0000000000bb'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.key IN ('tenant.view','user.create','user.view',
               'customer.create','customer.update','customer.view',
               'order.create','order.update','order.view',
               'commission.view','commission.var_margins','reports.view')
WHERE r.key = 'var_regional_manager' AND r.tenant_id = 'a0000000-0000-4000-a000-0000000000bb'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.key IN ('customer.create','customer.view','order.create','order.view','reports.view')
WHERE r.key = 'var_sales_rep' AND r.tenant_id = 'a0000000-0000-4000-a000-0000000000bb'
ON CONFLICT DO NOTHING;
