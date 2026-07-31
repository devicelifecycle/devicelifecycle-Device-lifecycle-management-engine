-- ============================================================================
-- RBAC FOUNDATION (Phase 2 of the VAR platform re-architecture)
-- 2026-07-31
--
-- Adds a permission-based access model (permissions → roles → users) that
-- MIRRORS the current 6 fixed roles, so nothing about today's behavior changes.
-- The app keeps using users.role; these tables are a parallel structure that
-- future delegated/hierarchical RBAC (N-level VAR roles) builds on.
--
-- Fully ADDITIVE: no existing table or policy is modified. System roles + the
-- user→role backfill are seeded against the Byte-Back platform tenant (which is
-- also where all current users live: id a0000000-0000-4000-a000-0000000000bb).
-- ============================================================================

-- ── Tables ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(80) UNIQUE NOT NULL,   -- e.g. 'order.create'
  resource VARCHAR(40) NOT NULL,
  action VARCHAR(40) NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) DEFAULT 'a0000000-0000-4000-a000-0000000000bb',
  key VARCHAR(60) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_system BOOLEAN NOT NULL DEFAULT false,   -- system template roles can't be deleted
  parent_role_id UUID REFERENCES roles(id),   -- delegated/hierarchical roles
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, key)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id);

-- ── Seed permission catalog ─────────────────────────────────────────────────
INSERT INTO permissions (key, resource, action, description) VALUES
  ('platform.manage','platform','manage','Manage global platform settings'),
  ('tenant.manage','tenant','manage','Create/suspend/delete VAR tenants'),
  ('tenant.view','tenant','view','View tenant details'),
  ('user.create','user','create','Create users'),
  ('user.update','user','update','Edit users'),
  ('user.delete','user','delete','Delete users'),
  ('user.view','user','view','View users'),
  ('customer.create','customer','create','Create customers'),
  ('customer.update','customer','update','Edit customers'),
  ('customer.delete','customer','delete','Delete customers'),
  ('customer.view','customer','view','View customers'),
  ('vendor.manage','vendor','manage','Manage vendors'),
  ('vendor.view','vendor','view','View vendors'),
  ('order.create','order','create','Create orders'),
  ('order.update','order','update','Edit orders'),
  ('order.transition','order','transition','Advance order status / triage'),
  ('order.view','order','view','View orders'),
  ('pricing.manage','pricing','manage','Manage pricing tables'),
  ('pricing.view','pricing','view','View pricing'),
  ('commission.manage','commission','manage','Set commission/margin model'),
  ('commission.view','commission','view','View commission reporting'),
  ('billing.manage','billing','manage','Invoice/pay + subscriptions'),
  ('billing.view','billing','view','View billing'),
  ('reports.view','reports','view','View reports'),
  ('audit.view','audit','view','View audit logs'),
  ('impersonate.tenant','impersonate','tenant','Impersonate users in scope'),
  ('feature.manage','feature','manage','Toggle feature flags'),
  ('licensing.manage','licensing','manage','Allocate licenses')
ON CONFLICT (key) DO NOTHING;

-- ── Seed the 6 current roles as system roles (Byte-Back platform tenant) ────
INSERT INTO roles (tenant_id, key, name, description, is_system) VALUES
  ('a0000000-0000-4000-a000-0000000000bb','admin','Platform Admin','Full platform access',true),
  ('a0000000-0000-4000-a000-0000000000bb','coe_manager','COE Manager','Manage COE operations',true),
  ('a0000000-0000-4000-a000-0000000000bb','coe_tech','COE Technician','Receiving, triage, shipping',true),
  ('a0000000-0000-4000-a000-0000000000bb','sales','Sales','Create and manage orders',true),
  ('a0000000-0000-4000-a000-0000000000bb','customer','Customer','View and submit orders',true),
  ('a0000000-0000-4000-a000-0000000000bb','vendor','Vendor','View assigned orders, submit bids',true)
ON CONFLICT (tenant_id, key) DO NOTHING;

-- ── Map role → permissions (mirrors current access) ─────────────────────────
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.key = 'admin' AND r.tenant_id = 'a0000000-0000-4000-a000-0000000000bb'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.key IN ('tenant.view','user.view','customer.create','customer.update','customer.delete','customer.view',
               'vendor.manage','vendor.view','order.create','order.update','order.transition','order.view',
               'pricing.view','commission.view','billing.view','reports.view','audit.view')
WHERE r.key = 'coe_manager' AND r.tenant_id = 'a0000000-0000-4000-a000-0000000000bb'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.key IN ('order.view','order.transition','customer.view','vendor.view','reports.view')
WHERE r.key = 'coe_tech' AND r.tenant_id = 'a0000000-0000-4000-a000-0000000000bb'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.key IN ('order.create','order.view','customer.create','customer.view','pricing.view','reports.view')
WHERE r.key = 'sales' AND r.tenant_id = 'a0000000-0000-4000-a000-0000000000bb'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.key IN ('order.create','order.view','reports.view')
WHERE r.key = 'customer' AND r.tenant_id = 'a0000000-0000-4000-a000-0000000000bb'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p
  ON p.key IN ('order.view','reports.view')
WHERE r.key = 'vendor' AND r.tenant_id = 'a0000000-0000-4000-a000-0000000000bb'
ON CONFLICT DO NOTHING;

-- ── Backfill user_roles from the existing users.role ────────────────────────
INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u
JOIN roles r ON r.key = u.role::text AND r.tenant_id = u.tenant_id
ON CONFLICT DO NOTHING;

-- ── Minimal RLS (catalog readable; roles scoped to tenant/admin) ────────────
ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS permissions_read ON permissions;
CREATE POLICY permissions_read ON permissions FOR SELECT
  USING (auth.role() = 'service_role' OR auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS roles_read ON roles;
CREATE POLICY roles_read ON roles FOR SELECT
  USING (auth.role() = 'service_role' OR tenant_id = auth_tenant_id() OR is_admin());

DROP POLICY IF EXISTS role_permissions_read ON role_permissions;
CREATE POLICY role_permissions_read ON role_permissions FOR SELECT
  USING (auth.role() = 'service_role' OR is_admin()
    OR role_id IN (SELECT id FROM roles WHERE tenant_id = auth_tenant_id()));

DROP POLICY IF EXISTS user_roles_read ON user_roles;
CREATE POLICY user_roles_read ON user_roles FOR SELECT
  USING (auth.role() = 'service_role' OR is_admin() OR user_id = auth.uid());
