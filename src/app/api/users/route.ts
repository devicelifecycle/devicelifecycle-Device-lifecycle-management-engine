// ============================================================================
// USERS API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { createUserSchema } from '@/lib/validations'
import { UserProvisioningService } from '@/services/user-provisioning.service'
import { tenantLimits } from '@/lib/tenant-limits'
import { quotaBlockMessage } from '@/lib/quota'
import { nonPlatformTenantId } from '@/lib/tenant-resolve'
export const dynamic = 'force-dynamic'

const ORG_ADMIN_ROLES = ['customer', 'vendor']

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, profile } = auth

    const isOrgAdmin = profile.is_org_admin && ORG_ADMIN_ROLES.includes(profile.role)
    if (profile.role !== 'admin' && !isOrgAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // An org admin only sees their own org/role's teammates. RLS on `users`
    // only permits a row's owner or a platform admin to SELECT it, so this
    // must go through the service-role client — the org/role filter below
    // is the real authorization boundary, not RLS.
    const client = isOrgAdmin ? createServiceRoleClient() : supabase
    let query = client.from('users').select('*').order('created_at', { ascending: false })
    if (isOrgAdmin) {
      if (!profile.organization_id) {
        return NextResponse.json({ error: 'Org admin account has no organization assigned' }, { status: 403 })
      }
      query = query.eq('organization_id', profile.organization_id).eq('role', profile.role)
    }
    const { data: users, error } = await query

    if (error) throw error

    const visibleUsers = (users || []).filter((user) => {
      const email = typeof user.email === 'string' ? user.email : ''
      return !(email.startsWith('deleted+') && email.endsWith('@login.local'))
    })

    return NextResponse.json({ data: visibleUsers })
  } catch (error) {
    console.error('Error fetching users:', error)
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { profile } = auth

    const isOrgAdmin = profile.role !== 'admin' && profile.is_org_admin && ORG_ADMIN_ROLES.includes(profile.role)
    if (profile.role !== 'admin' && !isOrgAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()

    // An org admin can only invite a teammate of their own role into their
    // own org — force these regardless of what the client sent, so a
    // tampered request can't create a different role or cross-org user.
    if (isOrgAdmin) {
      body.role = profile.role
      body.organization_id = profile.organization_id
      delete body.password
    }

    // Validate input with Zod (enforces valid role enum, email format, etc.)
    const validationResult = createUserSchema.safeParse(body)
    if (!validationResult.success) {
      const first = validationResult.error.errors[0]
      const message = first?.message ?? 'Validation failed'
      return NextResponse.json({ error: message }, { status: 400 })
    }

    const { full_name, email, role, password, organization_id, notification_email, phone } = validationResult.data

    // Per-tenant user quota. No-op for the platform tenant (unlimited by
    // default). Fails CLOSED — a failed lookup must block provisioning, not
    // silently allow it (a lookup error must never become a way to bypass the
    // limit).
    if (auth.tenantId) {
      try {
        const { data: tenant } = await auth.supabase.from('tenants').select('settings').eq('id', auth.tenantId).maybeSingle()
        const { license } = tenantLimits(tenant?.settings)
        if (license.users >= 0) {
          const { count } = await auth.supabase.from('users').select('id', { count: 'exact', head: true }).eq('tenant_id', auth.tenantId)
          const blocked = quotaBlockMessage(license.users, count ?? 0, 1, 'Users')
          if (blocked) return NextResponse.json({ error: blocked }, { status: 403 })
        }
      } catch (err) {
        console.error('Quota check failed — blocking user provisioning to avoid a limit bypass:', err)
        return NextResponse.json({ error: 'Could not verify plan limits. Please try again in a moment.' }, { status: 503 })
      }
    }

    const provisioned = await UserProvisioningService.provisionUser({
      fullName: full_name,
      email,
      role,
      password,
      organizationId: organization_id,
      notificationEmail: notification_email,
      phone,
      tenantId: nonPlatformTenantId(auth.tenantId),
    })

    return NextResponse.json(provisioned.user, { status: 201 })
  } catch (error) {
    console.error('Error creating user:', error)
    const message = error instanceof Error ? error.message : 'Failed to create user'
    return NextResponse.json(
      { error: message },
      { status: message.includes('exists') || message.includes('required') ? 400 : 500 }
    )
  }
}
