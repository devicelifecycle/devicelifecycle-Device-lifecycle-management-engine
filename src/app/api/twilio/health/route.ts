import { NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { EmailService } from '@/services/email.service'
import { getTwilioMaskedStatus } from '@/lib/twilio/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    if (!['admin', 'coe_manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const twilioConfigured = EmailService.isTwilioConfigured()

    return NextResponse.json({
      provider: 'twilio',
      twilio: getTwilioMaskedStatus(),
      sms_delivery: {
        works_without_carrier: twilioConfigured,
        destination_required: true,
      },
    })
  } catch (error) {
    console.error('Twilio health error:', error)
    return NextResponse.json({ error: 'Failed to load Twilio health' }, { status: 500 })
  }
}
