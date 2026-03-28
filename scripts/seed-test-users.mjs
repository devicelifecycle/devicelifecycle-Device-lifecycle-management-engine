#!/usr/bin/env node
/**
 * Seed test users for all roles (E2E testing).
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env.
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-test-users.mjs
 *   # Or: npm run seed-test-users
 *
 * Users created (all password: Test123!).
 * Admin/CoE Manager/CoE Tech use real emails; others use Login ID:
 *   Admin        -> jamal.h@genovation.ai
 *   CoE Manager  -> faisalahmed4629@gmail.com
 *   CoE Tech     -> jamalhuss@gmail.com
 *   sales        -> sales@login.local
 *   customer     -> customer@login.local
 *   vendor       -> vendor@login.local
 */

import { createClient } from '@supabase/supabase-js';

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TEST_USERS = [
  { loginId: 'admin', role: 'admin', full_name: 'Test Admin', email: 'jamal.h@genovation.ai' },
  { loginId: 'coemgr', role: 'coe_manager', full_name: 'Test CoE Manager', email: 'faisalahmed4629@gmail.com' },
  { loginId: 'coetech', role: 'coe_tech', full_name: 'Test CoE Tech', email: 'jamalhuss@gmail.com' },
  { loginId: 'sales', role: 'sales', full_name: 'Test Sales' },
  { loginId: 'customer', role: 'customer', full_name: 'Test Customer' },
  { loginId: 'vendor', role: 'vendor', full_name: 'Test Vendor' },
];
const PASSWORD = 'Test123!';

if (!URL || !SERVICE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  console.error('Set them in .env.local or pass as env vars.');
  process.exit(1);
}

const supabase = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function main() {
  const { data: org } = await supabase.from('organizations').select('id').limit(1).single();
  const orgId = org?.id || '00000000-0000-0000-0000-000000000001';

  for (const u of TEST_USERS) {
    const { loginId, role, full_name } = u;
    const email = u.email || `${loginId}@login.local`;
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (authError) {
      if (authError.message?.includes('already been registered')) {
        const { data: existing } = await supabase.auth.admin.listUsers();
        const user = existing?.users?.find((u) => u.email === email);
        if (user) {
          await ensureProfile(user.id, email, full_name, role, orgId);
          console.log('  Existing:', loginId, '-> profile updated');
        } else {
          console.error('  Error:', loginId, authError.message);
        }
      } else {
        console.error('  Auth error:', loginId, authError.message);
      }
    } else {
      await ensureProfile(authData.user.id, email, full_name, role, orgId);
      console.log('  Created:', loginId, `(${role})`);
    }
  }

  console.log('\nDone! Password: Test123!');
  console.log('  Admin: jamal.h@genovation.ai');
  console.log('  CoE Manager: faisalahmed4629@gmail.com');
  console.log('  CoE Tech: jamalhuss@gmail.com');
  console.log('  Sales: sales (or sales@login.local)');
}

async function ensureProfile(userId, email, fullName, role, orgId) {
  const { error } = await supabase.from('users').upsert(
    {
      id: userId,
      email,
      full_name: fullName,
      role,
      organization_id: orgId,
      is_active: true,
    },
    { onConflict: 'id' }
  );
  if (error) {
    console.error('  Profile error:', email, error.message);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
