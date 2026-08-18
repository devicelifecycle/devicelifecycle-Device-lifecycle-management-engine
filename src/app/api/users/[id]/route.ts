// ============================================================================
// USER BY ID API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { updateUserSchema } from '@/lib/validations'
import { isValidUUID } from '@/lib/utils'
export const dynamic = 'force-dynamic'


export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth
    if (!isValidUUID((await params).id)) {
      return NextResponse.json({ error: 'Invalid user ID format' }, { status: 400 })
    }

    const { data: targetUser } = await supabase
      .from('users')
      .select('*')
      .eq('id', (await params).id)
      .single()

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Users can always view their own profile
    if (authUser.id === (await params).id) {
      return NextResponse.json(targetUser)
    }

    const { role, organization_id } = profile

    // Admin and coe_manager can view all users
    if (role === 'admin' || role === 'coe_manager') {
      return NextResponse.json(targetUser)
    }

    // COE tech and sales can view users in their organization
    if (role === 'coe_tech' || role === 'sales') {
      if (targetUser.organization_id === organization_id) {
        return NextResponse.json(targetUser)
      }
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Customer and vendor can only view their own profile (already checked above)
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  } catch (error) {
    console.error('Error fetching user:', error)
    return NextResponse.json(
      { error: 'Failed to fetch user' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!isValidUUID((await params).id)) {
      return NextResponse.json({ error: 'Invalid user ID format' }, { status: 400 })
    }
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    const targetId = (await params).id
    const isSelf = authUser.id === targetId
    const isPlatformAdmin = profile?.role === 'admin'

    // An org admin (designated by the platform admin via is_org_admin) may
    // manage teammates of the same role within their own organization.
    // RLS on `users` only permits a row's owner or a platform admin to
    // SELECT/UPDATE it, so this lookup (and the eventual write below) must
    // go through the service-role client — the org/role match performed
    // here is the real authorization gate, not RLS.
    let isOrgAdminManagingTeammate = false
    if (!isSelf && !isPlatformAdmin && profile?.is_org_admin && ['customer', 'vendor'].includes(profile.role)) {
      const serviceRole = createServiceRoleClient()
      const { data: targetUser } = await serviceRole
        .from('users')
        .select('organization_id, role')
        .eq('id', targetId)
        .single()
      isOrgAdminManagingTeammate = !!targetUser
        && !!profile.organization_id
        && targetUser.organization_id === profile.organization_id
        && targetUser.role === profile.role
    }

    if (!isSelf && !isPlatformAdmin && !isOrgAdminManagingTeammate) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const validationResult = updateUserSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.errors },
        { status: 400 }
      )
    }

    const updateData: Record<string, unknown> = {
      ...validationResult.data,
      updated_at: new Date().toISOString()
    }

    // Non-admin users cannot change their own role or secondary_role
    if (isSelf && !isPlatformAdmin) {
      delete updateData.role
      delete updateData.secondary_role
    }
    // Only admins can set secondary_role, is_org_admin, or reset onboarding on any user
    if (!isPlatformAdmin) {
      delete updateData.secondary_role
      delete updateData.is_org_admin
      delete updateData.onboarding_completed_at
    }
    // An org admin managing a teammate may only toggle is_active — not role,
    // phone, name, etc. on someone else's account.
    if (isOrgAdminManagingTeammate) {
      for (const key of Object.keys(updateData)) {
        if (key !== 'is_active' && key !== 'updated_at') delete updateData[key]
      }
    }
    // No one may deactivate their own account through this route (org admin
    // or otherwise) — avoids an accidental lockout.
    if (isSelf && updateData.is_active === false) {
      return NextResponse.json({ error: 'Cannot deactivate your own account' }, { status: 400 })
    }

    // The write itself needs the service-role client for the same RLS
    // reason as the lookup above when an org admin targets a teammate.
    const writeClient = isOrgAdminManagingTeammate ? createServiceRoleClient() : supabase
    const { data: updatedUser, error } = await writeClient
      .from('users')
      .update(updateData)
      .eq('id', targetId)
      .select()
      .single()

    if (error) throw error

    // Deactivation is already enforced immediately at the app layer (is_active
    // is re-checked fresh from the DB on every request in requireAuth()), but
    // the user's underlying Supabase Auth session is untouched by that flag —
    // their refresh token stays valid at the auth server. Kill it too, as
    // defense in depth, so a still-active session can never mint a fresh
    // access token for a deactivated account even via a path that doesn't go
    // through requireAuth(). Best-effort: never fail the deactivation itself
    // over this secondary call.
    if (updateData.is_active === false) {
      const svc = createServiceRoleClient()
      await svc.auth.admin.updateUserById(targetId, { password: crypto.randomUUID() })
        .catch((err) => console.error('Failed to revoke auth session on deactivate:', err))
    }

    // Flush proxy-level profile cache when any routing-sensitive field changes.
    // Comment in profile-cache.ts claims all three are invalidated — ensure code matches.
    const CACHE_INVALIDATING_FIELDS = ['is_active', 'role', 'secondary_role', 'organization_id']
    if (CACHE_INVALIDATING_FIELDS.some(f => f in updateData)) {
      const { invalidateProfileCache } = await import('@/lib/cache/profile-cache')
      invalidateProfileCache(targetId)
    }

    return NextResponse.json(updatedUser)
  } catch (error) {
    console.error('Error updating user:', error)
    return NextResponse.json(
      { error: 'Failed to update user' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const targetId = (await params).id
    if (!isValidUUID(targetId)) {
      return NextResponse.json({ error: 'Invalid user ID format' }, { status: 400 })
    }
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden — admin role required' }, { status: 403 })
    }

    // Prevent self-deletion
    if (targetId === authUser.id) {
      return NextResponse.json({ error: 'Cannot delete your own account' }, { status: 400 })
    }

    const { data: targetProfile } = await supabase
      .from('users')
      .select('role')
      .eq('id', targetId)
      .single()

    // Prevent deletion of other admins
    if (targetProfile?.role === 'admin') {
      return NextResponse.json({ error: 'Cannot delete another admin account' }, { status: 400 })
    }

    const hardDelete = new URL(request.url).searchParams.get('hard') === 'true'

    if (hardDelete) {
      const archivedEmail = `deleted+${targetId}@login.local`
      const archivedName = `Deleted User ${targetId.slice(0, 8)}`

      // Hard delete: remove from auth + users table via service-role client.
      // If historical foreign-key references block deletion, archive the user
      // instead so they lose access and disappear from the admin list.
      const { createServiceRoleClient } = await import('@/lib/supabase/service-role')
      const serviceClient = createServiceRoleClient()
      const { error: authError } = await serviceClient.auth.admin.deleteUser(targetId)
      if (authError) {
        console.warn('Auth delete failed, archiving user instead:', authError)

        await serviceClient.auth.admin.updateUserById(targetId, {
          email: archivedEmail,
          password: crypto.randomUUID(),
          email_confirm: true,
          user_metadata: {},
          app_metadata: {},
        }).catch((updateError) => {
          console.warn('Failed to archive auth user credentials:', updateError)
        })

        const { error: archiveError } = await serviceClient
          .from('users')
          .update({
            full_name: archivedName,
            email: archivedEmail,
            notification_email: null,
            phone: null,
            is_active: false,
            updated_at: new Date().toISOString(),
          })
          .eq('id', targetId)

        if (archiveError) {
          console.error('Error archiving user after delete failure:', archiveError)
          return NextResponse.json({ error: 'Failed to remove user' }, { status: 500 })
        }

        return NextResponse.json({ success: true, hard: false, archived: true })
      }
      // users table row is removed via ON DELETE CASCADE on the auth.users FK
      return NextResponse.json({ success: true, hard: true })
    }

    // Soft delete — deactivate only
    const { error } = await supabase
      .from('users')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', targetId)

    if (error) throw error
    return NextResponse.json({ success: true, hard: false })
  } catch (error) {
    console.error('Error deleting user:', error)
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
  }
}
