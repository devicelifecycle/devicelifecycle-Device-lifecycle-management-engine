#!/usr/bin/env node
/**
 * Seed test users for all roles (E2E testing).
 * Requires: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in env.
 *
 * Usage:
 *   node --env-file=.env.local scripts/seed-test-users.mjs
 *   # Or: npm run seed-test-users
 *
 * Users created (all password: Test123! unless overridden by TEST_USER_PASSWORD).
 * Canonical internal identities:
 *   Admin        -> admin@login.local
 *   CoE Manager  -> coemgr@login.local
 *   CoE Tech     -> coetech@login.local
 *   sales        -> sales@login.local
 *   customer     -> customer@login.local
 *   vendor       -> vendor@login.local
 */

import { createClient } from '@supabase/supabase-js';
import { sendWelcomeCredentialsEmail } from './lib/send-welcome-email.mjs';

const URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const TEST_USERS = [
  { loginId: 'admin', role: 'admin', full_name: 'Test Admin' },
  { loginId: 'coemgr', role: 'coe_manager', full_name: 'Test CoE Manager' },
  { loginId: 'coetech', role: 'coe_tech', full_name: 'Test CoE Tech' },
  { loginId: 'sales', role: 'sales', full_name: 'Test Sales' },
  { loginId: 'customer', role: 'customer', full_name: 'Test Customer' },
  { loginId: 'vendor', role: 'vendor', full_name: 'Test Vendor' },
];
const PASSWORD = process.env.TEST_USER_PASSWORD || 'Test123!';

if (!URL || !SERVICE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
  console.error('Set them in .env.local or pass as env vars.');
  process.exit(1);
}

const supabase = createClient(URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function sendWelcomeIfEligible({ email, full_name, role, loginId }) {
  const result = await sendWelcomeCredentialsEmail({
    to: email,
    recipientName: full_name,
    role,
    password: PASSWORD,
    loginId: email.endsWith('@login.local') ? loginId : undefined,
  });

  if (result.sent) {
    console.log(`  Welcome email sent to ${email} via ${result.provider}`);
  } else if (result.reason !== 'no-real-email') {
    console.warn(`  Welcome email not sent to ${email}: ${result.reason}`);
  }
}

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
          const { error: updateError } = await supabase.auth.admin.updateUserById(user.id, {
            email,
            password: PASSWORD,
            email_confirm: true,
            user_metadata: { full_name },
          });
          if (updateError) {
            console.error('  Auth update error:', loginId, updateError.message);
            continue;
          }
          await ensureProfile(user.id, email, full_name, role, orgId);
          console.log('  Existing:', loginId, '-> auth + profile updated');
          await sendWelcomeIfEligible({ email, full_name, role, loginId });
        } else {
          console.error('  Error:', loginId, authError.message);
        }
      } else {
        console.error('  Auth error:', loginId, authError.message);
      }
    } else {
      await ensureProfile(authData.user.id, email, full_name, role, orgId);
      console.log('  Created:', loginId, `(${role})`);
      await sendWelcomeIfEligible({ email, full_name, role, loginId });
    }
  }

  console.log(`\nDone! Password: ${PASSWORD}`);
  console.log('  Admin: admin (or admin@login.local)');
  console.log('  CoE Manager: coemgr (or coemgr@login.local)');
  console.log('  CoE Tech: coetech (or coetech@login.local)');
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
