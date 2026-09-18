// ============================================================================
// ADMIN — VAR ADMINISTRATORS: list / provision a tenant's first admins
// ============================================================================
// The one provisioning step no console could do: creating a `var_entity_admin`.
// /var/team deliberately limits itself to regional managers and sales reps (an
// entity admin must not be able to mint peers), and the platform Users page
// only knows the six core roles — so a brand-new VAR had nobody who could log
// in until someone inserted a row by hand. This closes that.
//
// Platform admin only. Refuses the platform tenant (Byte-Back's own admins are
// `admin`, not `var_entity_admin`). Reuses UserProvisioningService end to end:
// same auth user creation, same welcome email under the VAR's branding, same
// temp-password fallback for login-id accounts.

import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { UserProvisioningService } from '@/services/user-provisioning.service'
import { isValidUUID } from '@/lib/utils'
import { checkRateLimitAsync, getClientIp, RATE_LIMITS } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const PLATFORM_TENANT_ID = 'a0000000-0000-4000-a000-0000000000bb'

const createSchema = z.object({
  full_name: z.string().min(2).max(120),
  email: z.string().min(1).max(200),
  notification_email: z.string().email().optional(),
  phone: z.string().max(40).optional(),
})

async function guard(id: string) {
  const auth = await requireAuth()
  if (!auth) return { error: unauthorized() as NextResponse }
  if (auth.effectiveRole !== 'admin') return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  if (!isValidUUID(id)) return { error: NextResponse.json({ error: 'Invalid tenant id' }, { status: 400 }) }
  return { auth }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await guard(id)
  if (g.error) return g.error

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('users')
    .select('id, full_name, email, notification_email, is_active, last_login_at, created_at')
    .eq('tenant_id', id)
    .eq('role', 'var_entity_admin')
    .order('created_at', { ascending: true })
  if (error) {
    console.error('tenant admins list failed', error)
    return NextResponse.json({ error: 'Failed to load administrators' }, { status: 500 })
  }
  return NextResponse.json({ data: data ?? [] })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await guard(id)
  if (g.error) return g.error

  const rl = await checkRateLimitAsync(`tenant-admin-create:${getClientIp(req)}`, RATE_LIMITS.api)
  if (!rl.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

  if (id === PLATFORM_TENANT_ID) {
    return NextResponse.json(
      { error: 'The platform tenant has platform admins, not VAR administrators. Use the Users page.' },
      { status: 400 },
    )
  }

  const parsed = createSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
  }

  const supabase = createServiceRoleClient()
  const { data: tenant, error: tErr } = await supabase
    .from('tenants').select('id, is_active').eq('id', id).maybeSingle()
  if (tErr) return NextResponse.json({ error: 'Failed to load tenant' }, { status: 500 })
  if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  if (!tenant.is_active) {
    return NextResponse.json({ error: 'Reactivate the VAR before adding administrators' }, { status: 400 })
  }

  try {
    const provisioned = await UserProvisioningService.provisionUser({
      fullName: parsed.data.full_name,
      email: parsed.data.email,
      role: 'var_entity_admin',
      notificationEmail: parsed.data.notification_email,
      phone: parsed.data.phone,
      tenantId: id,
    })
    return NextResponse.json(provisioned, { status: 201 })
  } catch (error) {
    console.error('Error provisioning VAR administrator:', error)
    const message = error instanceof Error ? error.message : 'Failed to create administrator'
    return NextResponse.json({ error: message }, { status: message.includes('exists') ? 400 : 500 })
  }
}
