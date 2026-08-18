// ============================================================================
// VAR TEAM MANAGEMENT — list / create delegated-role reps within one tenant
// ============================================================================
// A VAR Entity Admin manages their whole tenant's team (regional managers +
// sales reps); a Regional Manager manages only sales reps in their own
// region. A platform admin has no VAR tenant of their own, so they must pass
// ?tenant_id= (GET) / tenant_id (POST) to say which VAR they're acting on
// behalf of — a VAR-role actor always uses their own auth.tenantId and can
// never override it with a different tenant. Authorization decisions live in
// src/lib/delegation.ts (canManageVarTeamMember) so they're unit-tested in
// isolation from this route.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { UserProvisioningService } from '@/services/user-provisioning.service'
import { delegationLevel, canManageVarTeamMember, resolveTargetTenant, type ManagedVarRole } from '@/lib/delegation'
import { z } from 'zod'
import { checkRateLimitAsync, getClientIp, RATE_LIMITS } from '@/lib/rate-limit'
export const dynamic = 'force-dynamic'

const CONSOLE_ROLES = new Set(['var_entity_admin', 'var_regional_manager'])
const MANAGED_ROLES = ['var_regional_manager', 'var_sales_rep'] as const

const createSchema = z.object({
  full_name: z.string().min(2).max(120),
  email: z.string().min(1),
  role: z.enum(MANAGED_ROLES),
  region: z.string().max(80).optional(),
  notification_email: z.string().email().optional(),
  phone: z.string().max(30).optional(),
  /** Platform admin only — which VAR tenant this rep belongs to. */
  tenant_id: z.string().uuid().optional(),
})

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  const { profile, effectiveRole, tenantId } = auth
  const isPlatformAdmin = profile.role === 'admin'

  if (!isPlatformAdmin && !CONSOLE_ROLES.has(effectiveRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const requestedTenantId = request.nextUrl.searchParams.get('tenant_id')
  const targetTenant = resolveTargetTenant(isPlatformAdmin, tenantId, requestedTenantId)
  if (!targetTenant) return NextResponse.json({ data: [] })

  const svc = createServiceRoleClient()
  let query = svc
    .from('users')
    .select('id, full_name, email, role, region, is_active, created_at, last_login_at')
    .eq('tenant_id', targetTenant)
    .in('role', MANAGED_ROLES)
    .order('created_at', { ascending: false })

  // Regional manager only sees their own region's sales reps.
  if (!isPlatformAdmin && delegationLevel(effectiveRole) === 'region') {
    if (!profile.region) return NextResponse.json({ data: [] })
    query = query.eq('role', 'var_sales_rep').eq('region', profile.region)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Failed to load team' }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  try {
    const rl = await checkRateLimitAsync(`var-team-create:${getClientIp(request)}`, RATE_LIMITS.api)
    if (!rl.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { profile, effectiveRole, tenantId } = auth
    const isPlatformAdmin = profile.role === 'admin'

    if (!isPlatformAdmin && !CONSOLE_ROLES.has(effectiveRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const parsed = createSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
    }
    const body = parsed.data

    const targetTenant = resolveTargetTenant(isPlatformAdmin, tenantId, body.tenant_id ?? null)
    if (!targetTenant) {
      return NextResponse.json(
        { error: isPlatformAdmin ? 'tenant_id is required' : 'Your account has no VAR tenant to manage' },
        { status: 400 },
      )
    }

    if (!canManageVarTeamMember(profile.role, effectiveRole, profile.region, body.role as ManagedVarRole, body.region ?? null)) {
      return NextResponse.json({ error: 'You are not permitted to create this role in this region' }, { status: 403 })
    }
    // A regional manager creating a sales rep always stamps their own region —
    // canManageVarTeamMember already required body.region === profile.region
    // for that case, so this just makes the field mandatory on that path.
    if (!isPlatformAdmin && effectiveRole === 'var_regional_manager' && !body.region) {
      return NextResponse.json({ error: 'region is required' }, { status: 400 })
    }

    const provisioned = await UserProvisioningService.provisionUser({
      fullName: body.full_name,
      email: body.email,
      role: body.role,
      notificationEmail: body.notification_email,
      phone: body.phone,
      region: body.region,
      tenantId: targetTenant,
    })

    return NextResponse.json(provisioned, { status: 201 })
  } catch (error) {
    console.error('Error creating VAR team member:', error)
    const message = error instanceof Error ? error.message : 'Failed to create team member'
    return NextResponse.json({ error: message }, { status: message.includes('exists') ? 400 : 500 })
  }
}
