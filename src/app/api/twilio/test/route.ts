import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { isValidPhone } from '@/lib/utils'
import { EmailService } from '@/services/email.service'

export const dynamic = 'force-dynamic'

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '')
  if (digits.length < 4) return value
  return `***${digits.slice(-4)}`
}

export async function POST(request: NextRequest) {
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

    const body = await request.json().catch(() => null)
    const phoneNumber = typeof body?.phone_number === 'string' ? body.phone_number.trim() : ''
    const message = typeof body?.message === 'string' ? body.message.trim() : ''

    if (!phoneNumber || !isValidPhone(phoneNumber)) {
      return NextResponse.json({ error: 'A valid destination phone number is required' }, { status: 400 })
    }

    if (!EmailService.isTwilioConfigured()) {
      return NextResponse.json({ error: 'Twilio is not configured' }, { status: 503 })
    }

    const finalMessage = message || `DLM Engine Twilio test: delivery check sent at ${new Date().toISOString()}`
    const sent = await EmailService.sendSMS(phoneNumber, finalMessage)

    if (!sent) {
      return NextResponse.json({ error: 'Failed to send test SMS' }, { status: 502 })
    }

    return NextResponse.json({
      success: true,
      destination: maskPhone(phoneNumber),
      message_length: finalMessage.length,
    })
  } catch (error) {
    console.error('Twilio test send error:', error)
    return NextResponse.json({ error: 'Failed to send test SMS' }, { status: 500 })
  }
}
