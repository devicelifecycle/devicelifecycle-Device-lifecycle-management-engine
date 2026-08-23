// ============================================================================
// RESEND LOGIN — POST /api/organizations/[id]/resend-login
// Resets the portal user's password and re-sends their login credentials.
// Admin-only. Works for customer and vendor organizations.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { EmailService } from '@/services/email.service'
import { isValidUUID } from '@/lib/utils'
import crypto from 'node:crypto'
export const dynamic = 'force-dynamic'

function generateTempPassword() {
  const random = crypto.randomBytes(9).toString('base64url')
  return `Dlm-${random}!9a`
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orgId } = await params
    if (!isValidUUID(orgId)) {
      return NextResponse.json({ error: 'Invalid organization ID' }, { status: 400 })
    }

    const auth = await requireAuth()
    if (!auth) return unauthorized()

    if (auth.profile.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    const supabase = createServiceRoleClient()

    // Find the portal user linked to this organization (customer or vendor role)
    const { data: orgUser, error: orgUserError } = await supabase
      .from('users')
      .select('*')
      .eq('organization_id', orgId)
      .in('role', ['customer', 'vendor'])
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (orgUserError) {
      return NextResponse.json({ error: orgUserError.message }, { status: 500 })
    }

    if (!orgUser) {
      return NextResponse.json(
        { error: 'No active portal user found for this organization. Create a user manually first.' },
        { status: 404 }
      )
    }

    const tempPassword = generateTempPassword()

    // Reset the password via admin API
    const { error: resetError } = await supabase.auth.admin.updateUserById(orgUser.id, {
      password: tempPassword,
    })

    if (resetError) {
      return NextResponse.json({ error: resetError.message }, { status: 500 })
    }

    // Determine login identifier
    const loginId = orgUser.email?.endsWith('@login.local')
      ? orgUser.email.replace('@login.local', '')
      : undefined
    const emailTo = orgUser.notification_email ?? orgUser.email

    if (!emailTo) {
      return NextResponse.json({ error: 'No email address on file for this user' }, { status: 422 })
    }

    const emailSent = await EmailService.sendWelcomeEmail({
      to: emailTo,
      recipientName: orgUser.full_name,
      role: orgUser.role,
      tempPassword,
      loginId,
      tenantId: orgUser.tenant_id ?? null,
    })

    return NextResponse.json({
      success: true,
      email_sent_to: emailTo,
      email_sent: emailSent,
    })
  } catch (error) {
    console.error('resend-login error:', error)
    return NextResponse.json({ error: 'Failed to resend login' }, { status: 500 })
  }
}
