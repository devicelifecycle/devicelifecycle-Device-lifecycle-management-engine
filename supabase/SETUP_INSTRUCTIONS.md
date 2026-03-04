# Supabase Setup Instructions - Phase 1

## Overview

This guide will help you complete the Supabase setup for Phase 1 of the Device Lifecycle Management Engine. All migrations have been created and are ready to apply.

## Prerequisites

- Supabase CLI installed (`npm install -g supabase`)
- Supabase project created (local or cloud)
- `.env.local` configured with Supabase credentials

## Migration Files Created

1. **20240115000000_create_storage_buckets.sql** - Storage buckets for images, documents, uploads
2. **20240115000001_add_missing_rls_policies.sql** - RLS policies for triage, SLA tables
3. **20240115000002_seed_test_data.sql** - Test organizations, customers, vendors
4. **20240115000003_add_composite_indexes.sql** - Performance indexes
5. **20240115000004_fix_order_number_concurrency.sql** - Atomic order numbering

## Setup Steps

### Step 1: Initialize Supabase (if not already done)

```bash
# Start local Supabase (for local development)
supabase start

# OR link to remote project
supabase link --project-ref your-project-ref
```

### Step 2: Apply All Migrations

```bash
# Reset database and apply all migrations (including new ones)
supabase db reset

# OR push new migrations only
supabase db push
```

This will automatically apply:
- Initial schema (20240101000000_initial_schema.sql)
- New storage buckets + RLS policies
- Missing RLS policies for triage/SLA
- Test data (organizations, customers, vendors)
- Performance indexes
- Fixed order number generation

### Step 3: Apply Seed Data

```bash
# Seed device catalog and pricing
supabase db seed
```

This applies:
- 60 device catalog entries (Apple, Samsung, Google)
- 180+ pricing entries across all conditions

### Step 4: Create Test Users **MANUALLY**

⚠️ **CRITICAL**: You must create auth users manually in Supabase Dashboard:

1. Go to **Supabase Dashboard → Authentication → Users**
2. Click **"Add user"** and create these 6 users:

| Email | Password | Role | Organization |
|-------|----------|------|--------------|
| admin@example.com | Admin123! | Admin User | Enterprise Engine CoE |
| manager@example.com | Manager123! | CoE Manager | Enterprise Engine CoE |
| tech@example.com | Tech123! | CoE Technician | Enterprise Engine CoE |
| sales@example.com | Sales123! | Sales Representative | Enterprise Engine CoE |
| customer@example.com | Customer123! | Customer Contact | Acme Corporation |
| vendor@example.com | Vendor123! | Vendor Contact | TechSupply Inc |

3. After creating, **note down the UUID** for each user from the `auth.users` table

### Step 5: Link Users to Application

1. Open **Supabase SQL Editor**
2. Run the following query (replace UUIDs with actual values from Step 4):

```sql
insert into users (id, email, full_name, role, organization_id, is_active) values
  ('<UUID_admin>', 'admin@example.com', 'Admin User', 'admin', '00000000-0000-0000-0000-000000000001', true),
  ('<UUID_manager>', 'manager@example.com', 'CoE Manager', 'coe_manager', '00000000-0000-0000-0000-000000000001', true),
  ('<UUID_tech>', 'tech@example.com', 'CoE Technician', 'coe_tech', '00000000-0000-0000-0000-000000000001', true),
  ('<UUID_sales>', 'sales@example.com', 'Sales Representative', 'sales', '00000000-0000-0000-0000-000000000001', true),
  ('<UUID_customer>', 'customer@example.com', 'Customer Contact', 'customer', '00000000-0000-0000-0000-000000000002', true),
  ('<UUID_vendor>', 'vendor@example.com', 'Vendor Contact', 'vendor', '00000000-0000-0000-0000-000000000003', true);
```

### Step 6: (Optional) Create Sample Orders

If you want test orders for development, uncomment and run the sample orders section in:
`supabase/migrations/20240115000002_seed_test_data.sql` (lines 124-157)

### Step 7: Verify Storage Buckets

1. Go to **Supabase Dashboard → Storage**
2. Verify 3 buckets exist:
   - `device-images` (public)
   - `documents` (private)
   - `uploads` (private)

## Verification Checklist

After completing all steps, verify the setup:

### ✅ Database Schema
- [ ] 24 tables created
- [ ] All RLS policies active (no permission errors)
- [ ] Indexes created (run EXPLAIN ANALYZE on key queries)

### ✅ Storage
- [ ] 3 buckets created with proper access policies
- [ ] Can upload device images (test via triage page)
- [ ] Can upload CSV files (test via pricing admin)

### ✅ Seed Data
- [ ] 60 devices in device_catalog
- [ ] 180+ entries in pricing_tables
- [ ] 3 organizations (1 internal, 1 customer, 1 vendor)
- [ ] 3 customers, 3 vendors

### ✅ Test Users
- [ ] 6 users created in auth.users
- [ ] 6 users linked in users table
- [ ] Can login as each role
- [ ] RLS policies enforce correct access

### ✅ Application
- [ ] Login works for all 6 test users
- [ ] Dashboard loads without errors
- [ ] Orders list shows data (if sample orders created)
- [ ] Pricing admin shows 180+ entries
- [ ] Device catalog shows 60 devices

## Testing End-to-End Workflow

1. **Login as sales@example.com**
   - Create new trade-in order
   - Add 3 devices
   - Save as draft

2. **Login as manager@example.com**
   - View the order
   - Click "Set Pricing"
   - Enter unit prices
   - Save prices
   - Transition to "submitted"

3. **Login as tech@example.com**
   - View submitted order
   - Upload device photo (test storage)
   - Create triage result

4. **Verify Storage**
   - Check device-images bucket has uploaded photo
   - Download and verify image displays

## Troubleshooting

### Issue: Permission Denied on Tables
**Solution**: Verify RLS policies are active and user has correct role:
```sql
select * from users where email = 'your-email@example.com';
```

### Issue: Storage Upload Fails
**Solution**: Check bucket policies in Supabase Dashboard → Storage → bucket → Policies

### Issue: Order Numbers Duplicate
**Solution**: Verify sequence reset:
```sql
select last_value from order_number_seq;
select generate_order_number() from generate_series(1, 5);
```

### Issue: Build Errors
**Solution**: Rebuild the app:
```bash
npm run build
```

## Next Steps (Phase 2)

Once Phase 1 is verified:
- [x] Add real-time subscriptions for live updates (orders channel in useOrders)
- [x] Implement search (order_number, device make/model/SKU, customer/vendor filters)
- [x] Add batch operations (bulk-transition, bulk-delete for orders)
- [ ] Create Supabase Edge Functions for complex workflows (optional)

## Support

For issues or questions:
1. Check Supabase logs: `supabase status`
2. Review migration errors in SQL Editor
3. Test RLS policies directly in SQL Editor with `set role authenticated`
4. Verify `.env.local` has correct Supabase credentials

---

**Estimated Setup Time**: 30-45 minutes (including manual user creation)

**Phase 1 Completion Status**: All critical items completed ✅
