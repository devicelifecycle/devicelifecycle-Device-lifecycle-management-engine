// ============================================================================
// VAR TEAM MEMBER MANAGEMENT — disable / reactivate / reset password
// ============================================================================
// Same delegated-scope rules as POST /api/var/team: an Entity Admin manages
// their whole tenant's reps, a Regional Manager only their own region's sales
// reps. Reuses canManageVarTeamMember against the TARGET's actual stored
// role/region/tenant, so an actor can't act on a team member outside their
// scope no matter what the client sends.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { canManageVarTeamMember, type ManagedVarRole } from '@/lib/delegation'
import { EmailService } from '@/services/email.service'
import { generateTempPassword } from '@/services/user-provisioning.service'
import { isValidUUID } from '@/lib/utils'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

const MANAGED_ROLES = ['var_regional_manager', 'var_sales_rep'] as const

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('disable') }),
  z.object({ action: z.literal('reactivate') }),
  z.object({ action: z.literal('reset_password') }),
  z.object({ action: z.literal('reassign_region'), region: z.string().max(80).nullable() }),
])

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { profile, effectiveRole } = auth
    const { id } = await params
    if (!isValidUUID(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const svc = createServiceRoleClient()
    const { data: target } = await svc
      .from('users')
      .select('id, role, region, tenant_id, full_name, email, notification_email, is_active')
      .eq('id', id)
      .single()

    if (!target || !MANAGED_ROLES.includes(target.role as typeof MANAGED_ROLES[number])) {
      return NextResponse.json({ error: 'Team member not found' }, { status: 404 })
    }
    if (profile.role !== 'admin' && target.tenant_id !== auth.tenantId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    if (!canManageVarTeamMember(profile.role, effectiveRole, profile.region, target.role as ManagedVarRole, target.region)) {
      return NextResponse.json({ error: 'You are not permitted to manage this team member' }, { status: 403 })
    }

    const parsed = actionSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
    }
    const a = parsed.data

    if (a.action === 'reassign_region') {
      // Moving into a region the actor doesn't have authority over is the
      // same check as creating a rep there in the first place.
      if (!canManageVarTeamMember(profile.role, effectiveRole, profile.region, target.role as ManagedVarRole, a.region)) {
        return NextResponse.json({ error: 'Cannot move this team member to that region' }, { status: 403 })
      }
      const { error } = await svc.from('users').update({ region: a.region, updated_at: new Date().toISOString() }).eq('id', id)
      if (error) return NextResponse.json({ error: 'Failed to update region' }, { status: 500 })
      return NextResponse.json({ ok: true })
    }

    if (a.action === 'disable' || a.action === 'reactivate') {
      const nextActive = a.action === 'reactivate'
      const { error } = await svc.from('users').update({ is_active: nextActive, updated_at: new Date().toISOString() }).eq('id', id)
      if (error) return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
      // Same defense-in-depth as the platform user-management routes: kill the
      // underlying auth session on disable, not just our own is_active flag.
      if (!nextActive) {
        await svc.auth.admin.updateUserById(id, { password: crypto.randomUUID() })
          .catch((err) => console.error('Failed to revoke auth session on VAR rep disable:', err))
      }
      return NextResponse.json({ ok: true })
    }

    // reset_password
    const tempPassword = generateTempPassword()
    const { error: pwError } = await svc.auth.admin.updateUserById(id, { password: tempPassword })
    if (pwError) return NextResponse.json({ error: 'Failed to reset password' }, { status: 500 })

    const notifyEmail = target.notification_email || (target.email?.endsWith('@login.local') ? null : target.email)
    if (notifyEmail) {
      await EmailService.sendWelcomeEmail({
        to: notifyEmail,
        recipientName: target.full_name || 'Team member',
        role: target.role,
        tempPassword,
        loginId: target.email?.endsWith('@login.local') ? target.email.replace('@login.local', '') : undefined,
        tenantId: target.tenant_id ?? null,
      }).catch((err) => console.error('Failed to send password-reset notification:', err))
    }
    return NextResponse.json({ ok: true, tempPassword, emailSentTo: notifyEmail ?? undefined })
  } catch (error) {
    console.error('VAR team member management action failed:', error)
    return NextResponse.json({ error: 'Failed to update team member' }, { status: 500 })
  }
}
