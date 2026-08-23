// ============================================================================
// SEND PASSWORD CHANGE CONFIRMATION EMAIL
// Called after user successfully changes password (Profile or reset flow).
// ============================================================================

import { NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { EmailService } from '@/services/email.service'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    const email = authUser.email
    const { data: userFull } = await supabase.from('users').select('full_name, notification_email').eq('id', authUser.id).single()
    const notif = userFull?.notification_email
    // Login ID users (@login.local): use notification_email; otherwise use auth email
    const to = email?.endsWith('@login.local') ? notif : email
    if (!to) {
      return NextResponse.json({ ok: true }) // No deliverable email
    }

    await EmailService.sendPasswordChangeConfirmationEmail({
      to,
      recipientName: userFull?.full_name || 'User',
      tenantId: profile.tenant_id ?? null,
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Password change confirmation email error:', error)
    return NextResponse.json({ ok: true }) // Don't fail the flow if email fails
  }
}
