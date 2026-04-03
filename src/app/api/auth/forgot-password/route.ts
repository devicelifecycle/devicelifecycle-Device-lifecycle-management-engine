// ============================================================================
// FORGOT PASSWORD API
// Generates reset link via Supabase admin, sends via Resend (not Supabase email).
// This ensures emails work when Supabase SMTP is not configured.
// For Login ID users (@login.local), sends to notification_email if set in profile.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { getAppPath } from '@/lib/app-url'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { EmailService } from '@/services/email.service'
import { checkRateLimit, getClientIp, RATE_LIMITS } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const rl = checkRateLimit(`forgot-password:${getClientIp(request)}`, { ...RATE_LIMITS.api, limit: 10 })
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
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo: getAppPath('/reset-password', request),
      },
    })

    if (error) {
      console.error('[forgot-password] generateLink error:', error.message)
      return NextResponse.json({ ok: true })
    }

    const actionLink =
      (data as { properties?: { action_link?: string }; action_link?: string })?.properties?.action_link ||
      (data as { action_link?: string })?.action_link

    if (!actionLink) {
      console.error('[forgot-password] No action_link in generateLink response')
      return NextResponse.json({ ok: true })
    }

    const userName = (data as { user?: { user_metadata?: { full_name?: string } } })?.user?.user_metadata?.full_name || 'User'

    // Determine where to send: real email directly, or notification_email for Login ID users
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
        console.warn('[forgot-password] Login ID user has no notification_email set — add it in Profile or ask admin')
        return NextResponse.json({ ok: true })
      }
    } else {
      sendTo = email
    }

    if (!sendTo) {
      return NextResponse.json({ ok: true })
    }

    const sent = await EmailService.sendPasswordResetEmail({
      to: sendTo,
      recipientName: userName,
      resetLink: actionLink,
    })

    if (!sent) {
      console.error('[forgot-password] Resend failed - check RESEND_API_KEY')
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[forgot-password] Error:', err)
    return NextResponse.json({ ok: true })
  }
}
