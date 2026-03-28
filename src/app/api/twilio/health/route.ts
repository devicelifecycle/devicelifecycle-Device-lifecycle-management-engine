import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { EmailService } from '@/services/email.service'
import { getTwilioMaskedStatus } from '@/lib/twilio/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'admin') {
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
