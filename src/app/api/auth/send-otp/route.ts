// ============================================================================
// SEND OTP FOR PASSWORD RESET
// POST /api/auth/send-otp
// Generates a 6-digit recovery OTP using admin API and sends it via our email
// service. User then verifies the code client-side via supabase.auth.verifyOtp.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { EmailService } from '@/services/email.service'
import { checkRateLimitAsync, getClientIp, RATE_LIMITS } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const rl = await checkRateLimitAsync(`send-otp:${getClientIp(request)}`, { ...RATE_LIMITS.api, limit: 5 })
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 })
    }

    const body = await request.json().catch(() => ({}))
    const emailRaw = typeof body.email === 'string' ? body.email.trim() : ''
    if (!emailRaw) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    // Support Login ID: acme -> acme@login.local
    const email = emailRaw.includes('@') ? emailRaw : `${emailRaw}@login.local`

    const supabase = createServiceRoleClient()

    // Generate a recovery link — the response includes email_otp (6-digit code)
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
    })

    if (error || !data) {
      // Always return ok to avoid user enumeration
      console.error('[send-otp] generateLink error:', error?.message)
      return NextResponse.json({ ok: true })
    }

    const props = (data as { properties?: { email_otp?: string } })?.properties
    const otp = props?.email_otp
    if (!otp) {
      console.error('[send-otp] No email_otp in generateLink response')
      return NextResponse.json({ ok: true })
    }

    const userName = (data as { user?: { user_metadata?: { full_name?: string } } })?.user?.user_metadata?.full_name || 'User'

    // Determine where to send the code
    let sendTo: string | null = null
    if (email.endsWith('@login.local')) {
      const userId = (data as { user?: { id?: string } })?.user?.id
      if (userId) {
        const { data: profile } = await supabase
          .from('users')
          .select('notification_email')
          .eq('id', userId)
          .single()
        const notif = (profile as { notification_email?: string | null })?.notification_email
        if (notif && !notif.endsWith('@login.local')) {
          sendTo = notif
        }
      }
      if (!sendTo) {
        console.warn('[send-otp] Login ID user has no notification_email — use link method instead')
        return NextResponse.json({ ok: true })
      }
    } else {
      sendTo = email
    }

    if (!sendTo) return NextResponse.json({ ok: true })

    await EmailService.sendPasswordResetOtp({
      to: sendTo,
      recipientName: userName,
      otp,
    }).catch(e => console.error('[send-otp] Email send failed:', e))

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[send-otp] Error:', err)
    return NextResponse.json({ ok: true })
  }
}
