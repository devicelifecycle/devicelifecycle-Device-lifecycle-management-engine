-- ============================================================================
-- DEVICE LIFECYCLE MANAGEMENT ENGINE - DATABASE SCHEMA
-- Version: 1.0.0
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE user_role AS ENUM (
  'admin',
  'coe_manager',
  'coe_tech',
  'sales',
  'customer',
  'vendor'
);

CREATE TYPE order_status AS ENUM (
  'draft',
  'submitted',
  'quoted',
  'accepted',
  'rejected',
  'sourcing',
  'sourced',
  'shipped_to_coe',
  'received',
  'in_triage',
  'qc_complete',
  'ready_to_ship',
  'shipped',
  'delivered',
  'closed',
  'cancelled'
);

CREATE TYPE order_type AS ENUM (
  'trade_in',
  'cpo'
);

CREATE TYPE device_condition AS ENUM (
  'new',
  'excellent',
  'good',
  'fair',
  'poor'
);

CREATE TYPE notification_type AS ENUM (
  'in_app',
  'email',
  'sms'
);

CREATE TYPE audit_action AS ENUM (
  'create',
  'update',
  'delete',
  'login',
  'logout',
  'status_change',
  'price_change',
  'assignment'
);

CREATE TYPE shipment_status AS ENUM (
  'label_created',
  'picked_up',
  'in_transit',
  'out_for_delivery',
  'delivered',
  'exception'
);

-- ============================================================================
-- ORGANIZATIONS TABLE
-- ============================================================================

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL, -- 'customer', 'vendor', 'internal'
  address JSONB,
  contact_email VARCHAR(255),
  contact_phone VARCHAR(50),
  settings JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- USERS TABLE
-- ============================================================================

CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR(255) UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  role user_role NOT NULL DEFAULT 'customer',
  organization_id UUID REFERENCES organizations(id),
  phone VARCHAR(50),
  avatar_url TEXT,
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- CUSTOMERS TABLE
-- ============================================================================

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id),
  company_name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255) NOT NULL,
  contact_email VARCHAR(255) NOT NULL,
  contact_phone VARCHAR(50),
  billing_address JSONB,
  shipping_address JSONB,
  payment_terms VARCHAR(100),
  credit_limit DECIMAL(12, 2),
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- VENDORS TABLE
-- ============================================================================

CREATE TABLE vendors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id),
  company_name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255) NOT NULL,
  contact_email VARCHAR(255) NOT NULL,
  contact_phone VARCHAR(50),
  address JSONB,
  payment_terms VARCHAR(100),
  rating DECIMAL(3, 2), -- 0.00 to 5.00
  warranty_period_days INTEGER DEFAULT 30,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- DEVICES TABLE (Device Catalog)
-- ============================================================================

CREATE TABLE device_catalog (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  make VARCHAR(100) NOT NULL,
  model VARCHAR(255) NOT NULL,
  variant VARCHAR(255), -- Storage, color, etc.
  category VARCHAR(100), -- phone, tablet, laptop, watch
  sku VARCHAR(100) UNIQUE,
  specifications JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PRICING TABLES
-- ============================================================================

CREATE TABLE pricing_tables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id UUID REFERENCES device_catalog(id) ON DELETE CASCADE,
  condition device_condition NOT NULL,
  base_price DECIMAL(10, 2) NOT NULL,
  buy_price DECIMAL(10, 2), -- What we pay vendors
  sell_price DECIMAL(10, 2), -- What we charge customers
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expiry_date DATE,
  is_active BOOLEAN DEFAULT true,
  created_by_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(device_id, condition, effective_date)
);

-- ============================================================================
-- ORDERS TABLE
-- ============================================================================

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_number VARCHAR(50) UNIQUE NOT NULL,
  type order_type NOT NULL,
  status order_status DEFAULT 'draft',
  
  -- Relationships
  customer_id UUID REFERENCES customers(id),
  vendor_id UUID REFERENCES vendors(id),
  assigned_to_id UUID REFERENCES users(id),
  created_by_id UUID REFERENCES users(id) NOT NULL,
  
  -- Quantities and amounts
  total_quantity INTEGER DEFAULT 0,
  total_amount DECIMAL(12, 2) DEFAULT 0,
  quoted_amount DECIMAL(12, 2),
  final_amount DECIMAL(12, 2),
  
  -- Timestamps for each stage
  submitted_at TIMESTAMPTZ,
  quoted_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  shipped_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- SLA tracking
  is_sla_breached BOOLEAN DEFAULT false,
  sla_breach_at TIMESTAMPTZ,
  
  -- Metadata
  notes TEXT,
  internal_notes TEXT,
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- ORDER ITEMS TABLE
-- ============================================================================

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  device_id UUID REFERENCES device_catalog(id),
  
  quantity INTEGER NOT NULL DEFAULT 1,
  claimed_condition device_condition,
  actual_condition device_condition,
  
  unit_price DECIMAL(10, 2),
  quoted_price DECIMAL(10, 2),
  final_price DECIMAL(10, 2),
  
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- IMEI RECORDS TABLE
-- ============================================================================

CREATE TABLE imei_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  imei VARCHAR(20) NOT NULL,
  serial_number VARCHAR(100),
  
  order_id UUID REFERENCES orders(id),
  order_item_id UUID REFERENCES order_items(id),
  device_id UUID REFERENCES device_catalog(id),
  source_vendor_id UUID REFERENCES vendors(id),
  
  claimed_condition device_condition,
  actual_condition device_condition,
  
  quoted_price DECIMAL(10, 2),
  final_price DECIMAL(10, 2),
  
  triage_status VARCHAR(50) DEFAULT 'pending', -- pending, complete, needs_exception, rejected
  warranty_expiry DATE,
  activation_status VARCHAR(50),
  blacklist_status VARCHAR(50),
  
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(imei, order_id)
);

-- ============================================================================
-- TRIAGE RESULTS TABLE
-- ============================================================================

CREATE TABLE triage_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  imei_record_id UUID REFERENCES imei_records(id) ON DELETE CASCADE,
  order_id UUID REFERENCES orders(id),
  
  physical_condition device_condition,
  functional_grade device_condition,
  cosmetic_grade device_condition,
  
  screen_condition VARCHAR(50),
  battery_health INTEGER,
  storage_verified BOOLEAN,
  original_accessories BOOLEAN,
  
  functional_tests JSONB DEFAULT '{}',
  final_condition device_condition,
  
  condition_changed BOOLEAN DEFAULT false,
  price_adjustment DECIMAL(10, 2) DEFAULT 0,
  
  exception_required BOOLEAN DEFAULT false,
  exception_reason TEXT,
  exception_approved BOOLEAN,
  exception_approved_by_id UUID REFERENCES users(id),
  exception_approved_at TIMESTAMPTZ,
  exception_notes TEXT,
  
  notes TEXT,
  triaged_by_id UUID REFERENCES users(id),
  triaged_at TIMESTAMPTZ DEFAULT NOW(),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SHIPMENTS TABLE
-- ============================================================================

CREATE TABLE shipments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id),
  
  direction VARCHAR(20) NOT NULL, -- 'inbound', 'outbound'
  carrier VARCHAR(100) NOT NULL,
  tracking_number VARCHAR(100) NOT NULL,
  
  from_address JSONB NOT NULL,
  to_address JSONB NOT NULL,
  
  status shipment_status DEFAULT 'label_created',
  
  weight DECIMAL(10, 2),
  dimensions JSONB,
  
  estimated_delivery TIMESTAMPTZ,
  picked_up_at TIMESTAMPTZ,
  in_transit_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  exception_at TIMESTAMPTZ,
  exception_details TEXT,
  
  received_by_id UUID REFERENCES users(id),
  receiving_notes TEXT,
  
  tracking_events JSONB DEFAULT '[]',
  
  notes TEXT,
  created_by_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SLA RULES TABLE
-- ============================================================================

CREATE TABLE sla_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  from_status order_status NOT NULL,
  order_type order_type, -- NULL means applies to all types
  
  warning_hours INTEGER NOT NULL,
  breach_hours INTEGER NOT NULL,
  
  escalation_user_ids UUID[] DEFAULT '{}',
  
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SLA BREACHES TABLE
-- ============================================================================

CREATE TABLE sla_breaches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id),
  sla_rule_id UUID REFERENCES sla_rules(id),
  breached_at TIMESTAMPTZ NOT NULL,
  notification_sent BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- NOTIFICATIONS TABLE
-- ============================================================================

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type notification_type DEFAULT 'in_app',
  
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  
  related_entity_type VARCHAR(50),
  related_entity_id UUID,
  
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- AUDIT LOGS TABLE
-- ============================================================================

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id),
  action audit_action NOT NULL,
  
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  
  old_values JSONB,
  new_values JSONB,
  
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- ORDER TIMELINE TABLE
-- ============================================================================

CREATE TABLE order_timeline (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  event VARCHAR(255) NOT NULL,
  description TEXT,
  actor_id UUID REFERENCES users(id),
  actor_name VARCHAR(255),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- VENDOR BIDS TABLE
-- ============================================================================

CREATE TABLE vendor_bids (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  vendor_id UUID REFERENCES vendors(id),
  quantity INTEGER NOT NULL DEFAULT 0,
  unit_price DECIMAL(10, 2) NOT NULL,
  total_price DECIMAL(10, 2) NOT NULL,
  lead_time_days INTEGER,
  warranty_days INTEGER,
  notes TEXT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Users
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_organization ON users(organization_id);

-- Customers
CREATE INDEX idx_customers_company ON customers(company_name);
CREATE INDEX idx_customers_email ON customers(contact_email);
CREATE INDEX idx_customers_active ON customers(is_active);

-- Vendors
CREATE INDEX idx_vendors_company ON vendors(company_name);
CREATE INDEX idx_vendors_email ON vendors(contact_email);
CREATE INDEX idx_vendors_active ON vendors(is_active);

-- Devices
CREATE INDEX idx_devices_make ON device_catalog(make);
CREATE INDEX idx_devices_model ON device_catalog(model);
CREATE INDEX idx_devices_sku ON device_catalog(sku);
CREATE INDEX idx_devices_category ON device_catalog(category);

-- Pricing
CREATE INDEX idx_pricing_device ON pricing_tables(device_id);
CREATE INDEX idx_pricing_condition ON pricing_tables(condition);
CREATE INDEX idx_pricing_active ON pricing_tables(is_active);
CREATE INDEX idx_pricing_effective ON pricing_tables(effective_date);

-- Orders
CREATE INDEX idx_orders_number ON orders(order_number);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_type ON orders(type);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_vendor ON orders(vendor_id);
CREATE INDEX idx_orders_assigned ON orders(assigned_to_id);
CREATE INDEX idx_orders_created ON orders(created_at DESC);
CREATE INDEX idx_orders_sla_breach ON orders(is_sla_breached) WHERE is_sla_breached = true;

-- Order Items
CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_device ON order_items(device_id);

-- IMEI Records
CREATE INDEX idx_imei_imei ON imei_records(imei);
CREATE INDEX idx_imei_order ON imei_records(order_id);
CREATE INDEX idx_imei_vendor ON imei_records(source_vendor_id);
CREATE INDEX idx_imei_triage ON imei_records(triage_status);

-- Triage
CREATE INDEX idx_triage_imei ON triage_results(imei_record_id);
CREATE INDEX idx_triage_order ON triage_results(order_id);
CREATE INDEX idx_triage_exception ON triage_results(exception_required) WHERE exception_required = true;

-- Shipments
CREATE INDEX idx_shipments_order ON shipments(order_id);
CREATE INDEX idx_shipments_tracking ON shipments(tracking_number);
CREATE INDEX idx_shipments_status ON shipments(status);
CREATE INDEX idx_shipments_direction ON shipments(direction);

-- Notifications
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = false;

-- Audit Logs
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX idx_audit_action ON audit_logs(action);

-- Order Timeline
CREATE INDEX idx_order_timeline_order ON order_timeline(order_id);
CREATE INDEX idx_order_timeline_timestamp ON order_timeline(timestamp DESC);

-- Vendor Bids
CREATE INDEX idx_vendor_bids_order ON vendor_bids(order_id);
CREATE INDEX idx_vendor_bids_vendor ON vendor_bids(vendor_id);
CREATE INDEX idx_vendor_bids_status ON vendor_bids(status);

-- Full-text search indexes
CREATE INDEX idx_customers_search ON customers USING gin(to_tsvector('english', company_name || ' ' || contact_name));
CREATE INDEX idx_vendors_search ON vendors USING gin(to_tsvector('english', company_name || ' ' || contact_name));
CREATE INDEX idx_devices_search ON device_catalog USING gin(to_tsvector('english', make || ' ' || model || ' ' || COALESCE(variant, '')));

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Generate order number
CREATE OR REPLACE FUNCTION generate_order_number(order_type order_type)
RETURNS VARCHAR AS $$
DECLARE
  prefix VARCHAR(3);
  sequence_num INTEGER;
  year_suffix VARCHAR(2);
BEGIN
  prefix := CASE order_type
    WHEN 'trade_in' THEN 'TI-'
    WHEN 'cpo' THEN 'CPO-'
    ELSE 'ORD-'
  END;
  
  year_suffix := TO_CHAR(NOW(), 'YY');
  
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(order_number FROM '\d+$') AS INTEGER)
  ), 0) + 1
  INTO sequence_num
  FROM orders
  WHERE order_number LIKE prefix || year_suffix || '%';
  
  RETURN prefix || year_suffix || '-' || LPAD(sequence_num::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Updated_at triggers
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_vendors_updated_at BEFORE UPDATE ON vendors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON device_catalog
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_pricing_tables_updated_at BEFORE UPDATE ON pricing_tables
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_order_items_updated_at BEFORE UPDATE ON order_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_imei_records_updated_at BEFORE UPDATE ON imei_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_triage_results_updated_at BEFORE UPDATE ON triage_results
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_shipments_updated_at BEFORE UPDATE ON shipments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_sla_rules_updated_at BEFORE UPDATE ON sla_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_vendor_bids_updated_at BEFORE UPDATE ON vendor_bids
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE imei_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE triage_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE sla_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_bids ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- HELPER FUNCTION: Get current user's role
-- ============================================================================

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
  SELECT role FROM users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_internal_user()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM users 
    WHERE id = auth.uid() 
    AND role IN ('admin', 'coe_manager', 'coe_tech', 'sales')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================================
-- ORGANIZATIONS POLICIES
-- ============================================================================

-- Internal users can view all organizations
CREATE POLICY organizations_select_internal ON organizations FOR SELECT
  USING (is_internal_user());

-- Users can view their own organization
CREATE POLICY organizations_select_own ON organizations FOR SELECT
  USING (
    id IN (SELECT organization_id FROM users WHERE id = auth.uid())
  );

-- Only admins can manage organizations
CREATE POLICY organizations_insert_admin ON organizations FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY organizations_update_admin ON organizations FOR UPDATE
  USING (is_admin());

-- ============================================================================
-- USERS POLICIES
-- ============================================================================

-- Users can view their own profile
CREATE POLICY users_select_own ON users FOR SELECT
  USING (auth.uid() = id);

-- Internal users can view all users
CREATE POLICY users_select_internal ON users FOR SELECT
  USING (is_internal_user());

-- Admins can insert/update/delete users
CREATE POLICY users_insert_admin ON users FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY users_update_admin ON users FOR UPDATE
  USING (is_admin() OR auth.uid() = id);

-- ============================================================================
-- CUSTOMERS POLICIES
-- ============================================================================

-- Internal users can view all customers
CREATE POLICY customers_select_internal ON customers FOR SELECT
  USING (is_internal_user());

-- Customer users can view their own org's customer record
CREATE POLICY customers_select_own ON customers FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- Admin/sales can manage customers
CREATE POLICY customers_insert ON customers FOR INSERT
  WITH CHECK (is_internal_user());

CREATE POLICY customers_update ON customers FOR UPDATE
  USING (is_internal_user());

-- ============================================================================
-- VENDORS POLICIES
-- ============================================================================

-- Internal users can view all vendors
CREATE POLICY vendors_select_internal ON vendors FOR SELECT
  USING (is_internal_user());

-- Vendor users can view their own record
CREATE POLICY vendors_select_own ON vendors FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM users WHERE id = auth.uid()
    )
  );

-- Admin/sales can manage vendors
CREATE POLICY vendors_insert ON vendors FOR INSERT
  WITH CHECK (is_internal_user());

CREATE POLICY vendors_update ON vendors FOR UPDATE
  USING (is_internal_user());

-- ============================================================================
-- DEVICE CATALOG POLICIES
-- ============================================================================

-- Everyone can read device catalog
CREATE POLICY device_catalog_select ON device_catalog FOR SELECT
  USING (true);

-- Only admin/coe_manager can manage devices
CREATE POLICY device_catalog_insert ON device_catalog FOR INSERT
  WITH CHECK (is_admin() OR get_user_role() = 'coe_manager');

CREATE POLICY device_catalog_update ON device_catalog FOR UPDATE
  USING (is_admin() OR get_user_role() = 'coe_manager');

-- ============================================================================
-- PRICING POLICIES
-- ============================================================================

-- Internal users can view pricing
CREATE POLICY pricing_select ON pricing_tables FOR SELECT
  USING (is_internal_user());

-- Only admin can manage pricing
CREATE POLICY pricing_insert ON pricing_tables FOR INSERT
  WITH CHECK (is_admin());

CREATE POLICY pricing_update ON pricing_tables FOR UPDATE
  USING (is_admin());

-- ============================================================================
-- ORDERS POLICIES
-- ============================================================================

-- Internal users can view all orders
CREATE POLICY orders_select_internal ON orders FOR SELECT
  USING (is_internal_user());

-- Customer can view their own orders
CREATE POLICY orders_select_customer ON orders FOR SELECT
  USING (
    customer_id IN (
      SELECT id FROM customers 
      WHERE organization_id IN (
        SELECT organization_id FROM users WHERE id = auth.uid()
      )
    )
  );

-- Vendor can view orders assigned to them
CREATE POLICY orders_select_vendor ON orders FOR SELECT
  USING (
    vendor_id IN (
      SELECT id FROM vendors 
      WHERE organization_id IN (
        SELECT organization_id FROM users WHERE id = auth.uid()
      )
    )
  );

-- Internal users can create/update orders
CREATE POLICY orders_insert ON orders FOR INSERT
  WITH CHECK (is_internal_user());

CREATE POLICY orders_update ON orders FOR UPDATE
  USING (is_internal_user());

-- ============================================================================
-- ORDER ITEMS POLICIES (follow parent order)
-- ============================================================================

CREATE POLICY order_items_select ON order_items FOR SELECT
  USING (
    order_id IN (SELECT id FROM orders) -- inherits from orders policy
  );

CREATE POLICY order_items_insert ON order_items FOR INSERT
  WITH CHECK (is_internal_user());

CREATE POLICY order_items_update ON order_items FOR UPDATE
  USING (is_internal_user());

-- ============================================================================
-- IMEI RECORDS POLICIES
-- ============================================================================

CREATE POLICY imei_select_internal ON imei_records FOR SELECT
  USING (is_internal_user());

CREATE POLICY imei_insert ON imei_records FOR INSERT
  WITH CHECK (is_internal_user());

CREATE POLICY imei_update ON imei_records FOR UPDATE
  USING (is_internal_user());

-- ============================================================================
-- SHIPMENTS POLICIES
-- ============================================================================

CREATE POLICY shipments_select ON shipments FOR SELECT
  USING (is_internal_user() OR order_id IN (SELECT id FROM orders));

CREATE POLICY shipments_insert ON shipments FOR INSERT
  WITH CHECK (is_internal_user());

CREATE POLICY shipments_update ON shipments FOR UPDATE
  USING (is_internal_user());

-- ============================================================================
-- TRIAGE POLICIES
-- ============================================================================

CREATE POLICY triage_select ON triage_results FOR SELECT
  USING (is_internal_user());

CREATE POLICY triage_insert ON triage_results FOR INSERT
  WITH CHECK (is_internal_user());

CREATE POLICY triage_update ON triage_results FOR UPDATE
  USING (is_internal_user());

-- ============================================================================
-- NOTIFICATIONS POLICIES
-- ============================================================================

-- Users see only their own notifications
CREATE POLICY notifications_select_own ON notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY notifications_update_own ON notifications FOR UPDATE
  USING (user_id = auth.uid());

-- System/admin can create notifications for anyone
CREATE POLICY notifications_insert ON notifications FOR INSERT
  WITH CHECK (is_internal_user());

-- ============================================================================
-- AUDIT LOGS POLICIES
-- ============================================================================

-- Only admins can read audit logs
CREATE POLICY audit_select_admin ON audit_logs FOR SELECT
  USING (is_admin());

-- Internal users can create audit entries
CREATE POLICY audit_insert ON audit_logs FOR INSERT
  WITH CHECK (is_internal_user());

-- ============================================================================
-- SLA RULES POLICIES
-- ============================================================================

CREATE POLICY sla_rules_select ON sla_rules FOR SELECT
  USING (is_internal_user());

CREATE POLICY sla_rules_manage ON sla_rules FOR ALL
  USING (is_admin());

-- ============================================================================
-- ORDER TIMELINE POLICIES
-- ============================================================================

CREATE POLICY timeline_select ON order_timeline FOR SELECT
  USING (order_id IN (SELECT id FROM orders));

CREATE POLICY timeline_insert ON order_timeline FOR INSERT
  WITH CHECK (is_internal_user());

-- ============================================================================
-- VENDOR BIDS POLICIES
-- ============================================================================

CREATE POLICY vendor_bids_select_internal ON vendor_bids FOR SELECT
  USING (is_internal_user());

CREATE POLICY vendor_bids_select_vendor ON vendor_bids FOR SELECT
  USING (
    vendor_id IN (
      SELECT id FROM vendors 
      WHERE organization_id IN (
        SELECT organization_id FROM users WHERE id = auth.uid()
      )
    )
  );

CREATE POLICY vendor_bids_insert ON vendor_bids FOR INSERT
  WITH CHECK (is_internal_user() OR get_user_role() = 'vendor');

CREATE POLICY vendor_bids_update ON vendor_bids FOR UPDATE
  USING (is_internal_user() OR get_user_role() = 'vendor');

-- ============================================================================
-- SEED DATA - DEFAULT SLA RULES
-- ============================================================================

INSERT INTO sla_rules (name, from_status, warning_hours, breach_hours, is_active) VALUES
  ('Quote Response', 'submitted', 4, 8, true),
  ('Customer Response', 'quoted', 24, 48, true),
  ('Shipping to COE', 'accepted', 48, 72, true),
  ('Receiving at COE', 'shipped_to_coe', 8, 24, true),
  ('Triage Completion', 'received', 24, 48, true),
  ('Order Fulfillment', 'qc_complete', 24, 48, true),
  ('Final Delivery', 'shipped', 96, 168, true);

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
