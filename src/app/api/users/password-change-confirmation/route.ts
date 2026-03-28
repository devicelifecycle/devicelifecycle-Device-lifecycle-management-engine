// ============================================================================
// SEND PASSWORD CHANGE CONFIRMATION EMAIL
// Called after user successfully changes password (Profile or reset flow).
// ============================================================================

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { EmailService } from '@/services/email.service'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('email, full_name, notification_email')
      .eq('id', user.id)
      .single()

    const email = profile?.email
    const notif = (profile as { notification_email?: string | null })?.notification_email
    // Login ID users (@login.local): use notification_email; otherwise use profile email
    const to = email?.endsWith('@login.local') ? notif : email
    if (!to) {
      return NextResponse.json({ ok: true }) // No deliverable email
    }

    await EmailService.sendPasswordChangeConfirmationEmail({
      to,
      recipientName: profile?.full_name || 'User',
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Password change confirmation email error:', error)
    return NextResponse.json({ ok: true }) // Don't fail the flow if email fails
  }
}
