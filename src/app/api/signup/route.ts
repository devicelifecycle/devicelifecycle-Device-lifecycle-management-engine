// ============================================================================
// SELF-SERVE SIGNUP API — company → tenant → first admin → trial
// ============================================================================
// Creates a new VAR tenant, provisions the first var_entity_admin user, and
// starts a trial subscription. No payment required to start — the trial runs
// for DEFAULT_TRIAL_DAYS and the VAR can add a payment method before it ends.

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createTrialSubscription } from '@/lib/subscription-service'
import { DEFAULT_TRIAL_DAYS } from '@/lib/subscription'
import { tierBySlug } from '@/lib/plan-tiers'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

const signupSchema = z.object({
  company_name: z.string().min(2).max(255).transform(s => s.trim()),
  email: z.string().email().max(255).transform(s => s.toLowerCase().trim()),
  full_name: z.string().min(2).max(255).transform(s => s.trim()),
  password: z.string().min(8).max(128),
  plan_slug: z.string().min(2).max(60).default('essentials'),
})

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100)
}

export async function POST(request: NextRequest) {
  const parsed = signupSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
  }

  const { company_name, email, full_name, password, plan_slug } = parsed.data

  // Validate the plan exists
  const tier = tierBySlug(plan_slug)
  if (!tier) {
    return NextResponse.json({ error: `Unknown plan: ${plan_slug}` }, { status: 400 })
  }

  const supabase = createServiceRoleClient()

  // Check if email is already in use
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle()
  if (existingUser) {
    return NextResponse.json({ error: 'An account with this email already exists. Please sign in.' }, { status: 409 })
  }

  const slug = slugify(company_name)

  // Check if tenant slug is taken
  const { data: existingTenant } = await supabase
    .from('tenants')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  const tenantSlug = existingTenant ? `${slug}-${Date.now().toString(36)}` : slug

  try {
    // 1. Create the tenant
    const { data: tenant, error: tenantErr } = await supabase
      .from('tenants')
      .insert({
        name: company_name,
        slug: tenantSlug,
        type: 'var',
        plan: plan_slug,
        is_active: true,
      })
      .select('id, name, slug')
      .single()
    if (tenantErr) throw tenantErr

    // 2. Create the auth user via Supabase Auth
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    })
    if (authErr) {
      // Rollback: delete the tenant
      await supabase.from('tenants').delete().eq('id', tenant.id)
      throw authErr
    }

    // 3. Create the user profile as var_entity_admin
    const { error: userErr } = await supabase
      .from('users')
      .insert({
        id: authData.user.id,
        email,
        full_name,
        role: 'var_entity_admin',
        tenant_id: tenant.id,
        is_active: true,
        is_org_admin: true,
      })
    if (userErr) {
      // Rollback
      await supabase.auth.admin.deleteUser(authData.user.id)
      await supabase.from('tenants').delete().eq('id', tenant.id)
      throw userErr
    }

    // 4. Start the trial subscription
    let subscription = null
    try {
      subscription = await createTrialSubscription(supabase, tenant.id, plan_slug, DEFAULT_TRIAL_DAYS)
    } catch (subErr) {
      // Non-fatal: the tenant is created and operational even without a formal
      // subscription row — the feature gates and quotas still work via
      // tenants.plan, and the subscription can be added later.
      console.error('Failed to create trial subscription (non-fatal):', subErr)
    }

    return NextResponse.json({
      data: {
        tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
        user: { id: authData.user.id, email },
        subscription: subscription ? {
          id: subscription.id,
          status: subscription.status,
          trialEndsAt: subscription.trial_ends_at,
        } : null,
        trialDays: DEFAULT_TRIAL_DAYS,
      },
    }, { status: 201 })
  } catch (err) {
    console.error('Signup failed:', err)
    const message = err instanceof Error ? err.message : 'Signup failed'
    if (message.includes('already exists') || message.includes('duplicate')) {
      return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Signup failed. Please try again.' }, { status: 500 })
  }
}
