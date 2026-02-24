-- ============================================================================
-- TEST DATA SEED MIGRATION
-- ============================================================================
-- Creates test organizations, customers, vendors, and sample orders
-- IMPORTANT: Requires manual auth user creation first (see instructions below)

-- ============================================================================
-- MANUAL STEP REQUIRED BEFORE RUNNING THIS MIGRATION
-- ============================================================================
-- 1. Go to Supabase Dashboard → Authentication → Users
-- 2. Click "Add user" and create these 6 users:
--    a. admin@example.com      / Admin123!     (Admin User)
--    b. manager@example.com    / Manager123!   (CoE Manager)
--    c. tech@example.com       / Tech123!      (CoE Technician)
--    d. sales@example.com      / Sales123!     (Sales Representative)
--    e. customer@example.com   / Customer123!  (Customer Contact)
--    f. vendor@example.com     / Vendor123!    (Vendor Contact)
--
-- 3. After creating, note down the UUID for each user from auth.users table
-- 4. Update the INSERT statements below (lines 41-46) with the actual UUIDs
-- ============================================================================

-- ============================================================================
-- 1. ORGANIZATIONS
-- ============================================================================

insert into organizations (id, name, type, address, contact_email, contact_phone, is_active) values
  ('00000000-0000-0000-0000-000000000001', 'Enterprise Engine CoE', 'internal',
   '{"street": "123 Main St", "city": "San Francisco", "state": "CA", "zip_code": "94105", "country": "USA"}'::jsonb,
   'admin@enterprise-engine.com', '+1-415-555-0100', true),

  ('00000000-0000-0000-0000-000000000002', 'Acme Corporation', 'customer',
   '{"street": "456 Market St", "city": "New York", "state": "NY", "zip_code": "10001", "country": "USA"}'::jsonb,
   'contact@acme.com', '+1-212-555-0200', true),

  ('00000000-0000-0000-0000-000000000003', 'TechSupply Inc', 'vendor',
   '{"street": "789 Supply Rd", "city": "Austin", "state": "TX", "zip_code": "78701", "country": "USA"}'::jsonb,
   'sales@techsupply.com', '+1-512-555-0300', true);

-- ============================================================================
-- 2. LINK AUTH USERS TO USERS TABLE
-- ============================================================================
-- REPLACE THE UUIDs BELOW WITH ACTUAL auth.users IDs FROM STEP 3 ABOVE

/*
-- Example: After creating auth users, run this with actual UUIDs:

insert into users (id, email, full_name, role, organization_id, is_active) values
  ('<UUID_FROM_AUTH_admin@example.com>', 'admin@example.com', 'Admin User', 'admin', '00000000-0000-0000-0000-000000000001', true),
  ('<UUID_FROM_AUTH_manager@example.com>', 'manager@example.com', 'CoE Manager', 'coe_manager', '00000000-0000-0000-0000-000000000001', true),
  ('<UUID_FROM_AUTH_tech@example.com>', 'tech@example.com', 'CoE Technician', 'coe_tech', '00000000-0000-0000-0000-000000000001', true),
  ('<UUID_FROM_AUTH_sales@example.com>', 'sales@example.com', 'Sales Representative', 'sales', '00000000-0000-0000-0000-000000000001', true),
  ('<UUID_FROM_AUTH_customer@example.com>', 'customer@example.com', 'Customer Contact', 'customer', '00000000-0000-0000-0000-000000000002', true),
  ('<UUID_FROM_AUTH_vendor@example.com>', 'vendor@example.com', 'Vendor Contact', 'vendor', '00000000-0000-0000-0000-000000000003', true);
*/

-- ============================================================================
-- 3. CUSTOMERS
-- ============================================================================

insert into customers (id, company_name, contact_name, contact_email, contact_phone,
                       billing_address, shipping_address, payment_terms, credit_limit, is_active) values
  ('10000000-0000-0000-0000-000000000001',
   'Acme Corporation', 'John Smith', 'john@acme.com', '+1-212-555-0100',
   '{"street": "456 Market St", "city": "New York", "state": "NY", "zip_code": "10001"}'::jsonb,
   '{"street": "456 Market St", "city": "New York", "state": "NY", "zip_code": "10001"}'::jsonb,
   'Net 30', 100000, true),

  ('10000000-0000-0000-0000-000000000002',
   'Global Tech Solutions', 'Jane Doe', 'jane@globaltech.com', '+1-408-555-0200',
   '{"street": "789 Tech Blvd", "city": "San Jose", "state": "CA", "zip_code": "95110"}'::jsonb,
   '{"street": "789 Tech Blvd", "city": "San Jose", "state": "CA", "zip_code": "95110"}'::jsonb,
   'Net 30', 150000, true),

  ('10000000-0000-0000-0000-000000000003',
   'Mobile Retail Group', 'Bob Johnson', 'bob@mobileretail.com', '+1-310-555-0300',
   '{"street": "321 Retail Ave", "city": "Los Angeles", "state": "CA", "zip_code": "90001"}'::jsonb,
   '{"street": "321 Retail Ave", "city": "Los Angeles", "state": "CA", "zip_code": "90001"}'::jsonb,
   'Net 15', 75000, true);

-- ============================================================================
-- 4. VENDORS
-- ============================================================================

insert into vendors (id, company_name, contact_name, contact_email, contact_phone,
                     address, payment_terms, warranty_period_days, is_active) values
  ('20000000-0000-0000-0000-000000000001',
   'TechSupply Inc', 'Mike Johnson', 'mike@techsupply.com', '+1-512-555-0300',
   '{"street": "789 Supply Rd", "city": "Austin", "state": "TX", "zip_code": "78701"}'::jsonb,
   'Net 30', 90, true),

  ('20000000-0000-0000-0000-000000000002',
   'DeviceSource LLC', 'Sarah Lee', 'sarah@devicesource.com', '+1-206-555-0400',
   '{"street": "123 Distributor Way", "city": "Seattle", "state": "WA", "zip_code": "98101"}'::jsonb,
   'Net 45', 60, true),

  ('20000000-0000-0000-0000-000000000003',
   'Wholesale Mobile Partners', 'Tom Chen', 'tom@wholesalemobile.com', '+1-312-555-0500',
   '{"street": "456 Wholesale Dr", "city": "Chicago", "state": "IL", "zip_code": "60601"}'::jsonb,
   'Net 60', 30, true);

-- ============================================================================
-- 5. SAMPLE ORDERS (Draft Status for Testing)
-- ============================================================================
-- NOTE: These orders use a placeholder created_by_id that must be updated
-- after running the users insert above

-- Trade-in order example
/*
-- Uncomment and update after creating users:

insert into orders (id, order_number, type, customer_id, status, total_quantity,
                    customer_notes, internal_notes, created_by_id) values
  ('30000000-0000-0000-0000-000000000001',
   'ORD-2024-0001', 'trade_in', '10000000-0000-0000-0000-000000000001',
   'draft', 10,
   'Bulk trade-in from company refresh program',
   'Priority customer - handle with care',
   (SELECT id FROM users WHERE role = 'sales' LIMIT 1));

-- Order items (assumes iPhone 13 128GB exists in device_catalog from seed data)
insert into order_items (order_id, device_id, quantity, storage, color, claimed_condition, notes) values
  ('30000000-0000-0000-0000-000000000001',
   (SELECT id FROM device_catalog WHERE make='Apple' AND model='iPhone 13' AND variant='128GB' LIMIT 1),
   5, '128GB', 'Blue', 'good', 'Functional screens'),
  ('30000000-0000-0000-0000-000000000001',
   (SELECT id FROM device_catalog WHERE make='Apple' AND model='iPhone 13' AND variant='256GB' LIMIT 1),
   5, '256GB', 'Black', 'excellent', 'Like new condition');

-- CPO order example
insert into orders (id, order_number, type, customer_id, vendor_id, status, total_quantity,
                    customer_notes, internal_notes, created_by_id) values
  ('30000000-0000-0000-0000-000000000002',
   'ORD-2024-0002', 'cpo', '10000000-0000-0000-0000-000000000002',
   '20000000-0000-0000-0000-000000000001', 'submitted', 15,
   'Need these for corporate deployment',
   'TechSupply has confirmed availability',
   (SELECT id FROM users WHERE role = 'sales' LIMIT 1));

-- Order items for CPO
insert into order_items (order_id, device_id, quantity, storage, color, claimed_condition, unit_price) values
  ('30000000-0000-0000-0000-000000000002',
   (SELECT id FROM device_catalog WHERE make='Apple' AND model='iPhone 14' AND variant='128GB' LIMIT 1),
   10, '128GB', 'Midnight', 'excellent', 599.00),
  ('30000000-0000-0000-0000-000000000002',
   (SELECT id FROM device_catalog WHERE make='Apple' AND model='iPhone 14' AND variant='256GB' LIMIT 1),
   5, '256GB', 'Purple', 'new', 699.00);
*/

-- ============================================================================
-- POST-MIGRATION INSTRUCTIONS
-- ============================================================================
-- After running this migration:
-- 1. Uncomment the users INSERT statement (lines 41-46) and fill in actual UUIDs
-- 2. Run that insert manually in Supabase SQL Editor
-- 3. Uncomment the sample orders section (lines 124-157) if you want test orders
-- 4. Run those inserts manually
-- 5. Test login with each user role to verify RLS policies work correctly
-- ============================================================================
