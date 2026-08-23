// ============================================================================
// USER PROVISIONING SERVICE
// ============================================================================

import crypto from 'node:crypto'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { EmailService } from './email.service'
import type { User, AppRole } from '@/types'

// AppRole (not just the 6 core UserRole values) so this can also provision the
// delegated VAR roles (var_entity_admin/var_regional_manager/var_sales_rep).
type ProvisionableRole = AppRole

interface ProvisionUserParams {
  fullName: string
  email: string
  role: ProvisionableRole
  organizationId?: string
  password?: string
  notificationEmail?: string
  phone?: string
  oneUserPerRolePerOrganization?: boolean
  /** Tenant the new user belongs to. Omit to inherit the DB default (platform). */
  tenantId?: string
  /** Delegated VAR scoping — the region a var_regional_manager/var_sales_rep is assigned to. */
  region?: string
}

interface ProvisionUserResult {
  user: User | null
  created: boolean
  skippedReason?: string
  tempPassword?: string
  emailSentTo?: string
  emailSent?: boolean
  loginId?: string
}

const ROLES_REQUIRING_ORG = new Set<AppRole>(['sales', 'customer', 'vendor'])

function buildAuthIdentity(email: string, notificationEmail?: string) {
  const authEmail = email.includes('@') ? email.trim().toLowerCase() : `${email.trim()}@login.local`
  const isLoginId = authEmail.endsWith('@login.local')
  const loginId = isLoginId ? email.trim() : undefined
  const emailToSend = isLoginId ? notificationEmail?.trim().toLowerCase() : authEmail

  if (!emailToSend) {
    throw new Error('A notification email is required when using a Login ID')
  }

  return {
    authEmail,
    isLoginId,
    loginId,
    emailToSend,
  }
}

// 16 bytes of crypto-random base64url — no fixed prefix/suffix. A fixed pattern
// (e.g. "Dlm-...!9a") doesn't reduce the entropy an attacker has to brute-force,
// but it does needlessly advertise "this is a Byte-Back generated password" to
// anyone who intercepts it. Plain high-entropy random is strictly better with
// no downside.
export function generateTempPassword() {
  return crypto.randomBytes(16).toString('base64url')
}

async function findUserByField(field: 'email' | 'notification_email', value: string) {
  const supabase = createServiceRoleClient()
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq(field, value)
    .maybeSingle()

  if (error) {
    throw new Error(error.message)
  }

  return (data as User | null) ?? null
}

/**
 * After a customer/vendor profile is soft-deleted, the org's portal login
 * (users row, one per role per org) still holds the email, blocking re-use.
 * Free it up: try a hard delete of the auth user; if historical foreign-key
 * references (orders.created_by_id, audit_logs.actor_id, etc.) block that,
 * archive the row instead (same fallback used by DELETE /api/users/[id]).
 */
export async function releasePortalLoginEmail(organizationId: string, role: ProvisionableRole): Promise<void> {
  const supabase = createServiceRoleClient()

  const { data: user } = await supabase
    .from('users')
    .select('id, email')
    .eq('organization_id', organizationId)
    .eq('role', role)
    .maybeSingle()

  if (!user) return

  const { error: authError } = await supabase.auth.admin.deleteUser(user.id)
  if (!authError) return // users row removed via ON DELETE CASCADE

  const archivedEmail = `deleted+${user.id}@login.local`
  console.warn('Auth delete failed while releasing portal login, archiving instead:', authError)

  await supabase.auth.admin.updateUserById(user.id, {
    email: archivedEmail,
    password: crypto.randomUUID(),
    email_confirm: true,
    user_metadata: {},
    app_metadata: {},
  }).catch((updateError) => {
    console.warn('Failed to archive auth user credentials:', updateError)
  })

  await supabase
    .from('users')
    .update({
      email: archivedEmail,
      notification_email: null,
      phone: null,
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', user.id)
}

export class UserProvisioningService {
  static async assertEmailAvailable(email: string, notificationEmail?: string) {
    const { authEmail, emailToSend } = buildAuthIdentity(email, notificationEmail)

    const existingAuthEmailUser = await findUserByField('email', authEmail)
    if (existingAuthEmailUser) {
      throw new Error('A user account with this login email already exists')
    }

    if (emailToSend !== authEmail) {
      const existingNotificationUser = await findUserByField('notification_email', emailToSend)
      if (existingNotificationUser) {
        throw new Error('A user account with this notification email already exists')
      }
    }
  }

  static async provisionUser(params: ProvisionUserParams): Promise<ProvisionUserResult> {
    const { authEmail, isLoginId, loginId, emailToSend } = buildAuthIdentity(
      params.email,
      params.notificationEmail
    )

    if (ROLES_REQUIRING_ORG.has(params.role) && !params.organizationId) {
      throw new Error('organization_id is required for sales, customer, and vendor roles')
    }

    const supabase = createServiceRoleClient()

    if (params.oneUserPerRolePerOrganization && params.organizationId) {
      const { data: existingOrgUser, error: existingOrgUserError } = await supabase
        .from('users')
        .select('*')
        .eq('organization_id', params.organizationId)
        .eq('role', params.role)
        .maybeSingle()

      if (existingOrgUserError) {
        throw new Error(existingOrgUserError.message)
      }

      if (existingOrgUser) {
        return {
          user: existingOrgUser as User,
          created: false,
          skippedReason: `${params.role} portal user already exists for this organization`,
        }
      }
    }

    await this.assertEmailAvailable(params.email, params.notificationEmail)

    const tempPassword = params.password ?? generateTempPassword()

    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: authEmail,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: params.fullName },
    })

    if (authError) {
      if (authError.message?.toLowerCase().includes('already')) {
        throw new Error('A user account with this email already exists')
      }
      throw new Error(authError.message)
    }

    const { data: profile, error: profileError } = await supabase
      .from('users')
      .insert({
        id: authData.user.id,
        full_name: params.fullName,
        email: authEmail,
        role: params.role,
        organization_id: params.organizationId,
        is_active: true,
        notification_email: isLoginId ? emailToSend : null,
        phone: params.phone || null,
        // Only stamp tenant_id when explicitly provided (VAR invite); otherwise
        // omit the key so the column keeps its DB default (platform tenant).
        ...(params.tenantId ? { tenant_id: params.tenantId } : {}),
        ...(params.region ? { region: params.region } : {}),
      })
      .select()
      .single()

    if (profileError) {
      await supabase.auth.admin.deleteUser(authData.user.id)
      throw new Error(profileError.message)
    }

    const emailSent = await EmailService.sendWelcomeEmail({
      to: emailToSend,
      recipientName: params.fullName,
      role: params.role,
      tempPassword,
      loginId,
      tenantId: params.tenantId ?? null,
    })

    return {
      user: profile as User,
      created: true,
      tempPassword,
      emailSentTo: emailToSend,
      emailSent,
      loginId,
    }
  }
}
