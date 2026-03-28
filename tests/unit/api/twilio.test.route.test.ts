import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const createServerSupabaseClientMock = vi.fn()
const isTwilioConfiguredMock = vi.fn()
const sendSmsMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}))

vi.mock('@/services/email.service', () => ({
  EmailService: {
    isTwilioConfigured: isTwilioConfiguredMock,
    sendSMS: sendSmsMock,
  },
}))

function makeSupabase(user: { id: string } | null, role?: string | null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user } }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table !== 'users') {
        throw new Error(`Unexpected table: ${table}`)
      }

      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: role ? { role } : null }),
          }),
        }),
      }
    }),
  }
}

describe('POST /api/twilio/test', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 401 when not authenticated', async () => {
    createServerSupabaseClientMock.mockReturnValue(makeSupabase(null))

    const { POST } = await import('@/app/api/twilio/test/route')
    const response = await POST(new NextRequest('http://localhost/api/twilio/test', { method: 'POST' }))
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json).toEqual({ error: 'Unauthorized' })
  })

  it('returns 403 for non-admin users', async () => {
    createServerSupabaseClientMock.mockReturnValue(makeSupabase({ id: 'u1' }, 'sales'))

    const { POST } = await import('@/app/api/twilio/test/route')
    const response = await POST(new NextRequest('http://localhost/api/twilio/test', { method: 'POST' }))
    const json = await response.json()

    expect(response.status).toBe(403)
    expect(json).toEqual({ error: 'Forbidden' })
  })

  it('validates destination phone numbers', async () => {
    createServerSupabaseClientMock.mockReturnValue(makeSupabase({ id: 'u1' }, 'admin'))

    const { POST } = await import('@/app/api/twilio/test/route')
    const response = await POST(new NextRequest('http://localhost/api/twilio/test', {
      method: 'POST',
      body: JSON.stringify({ phone_number: '123', message: 'hello' }),
    }))
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json).toEqual({ error: 'A valid destination phone number is required' })
  })

  it('returns 503 when Twilio is not configured', async () => {
    createServerSupabaseClientMock.mockReturnValue(makeSupabase({ id: 'u1' }, 'admin'))
    isTwilioConfiguredMock.mockReturnValue(false)

    const { POST } = await import('@/app/api/twilio/test/route')
    const response = await POST(new NextRequest('http://localhost/api/twilio/test', {
      method: 'POST',
      body: JSON.stringify({ phone_number: '+14165551234', message: 'hello' }),
    }))
    const json = await response.json()

    expect(response.status).toBe(503)
    expect(json).toEqual({ error: 'Twilio is not configured' })
  })

  it('sends an SMS for admins when Twilio is configured', async () => {
    createServerSupabaseClientMock.mockReturnValue(makeSupabase({ id: 'u1' }, 'admin'))
    isTwilioConfiguredMock.mockReturnValue(true)
    sendSmsMock.mockResolvedValue(true)

    const { POST } = await import('@/app/api/twilio/test/route')
    const response = await POST(new NextRequest('http://localhost/api/twilio/test', {
      method: 'POST',
      body: JSON.stringify({ phone_number: '+14165551234', message: 'hello from dlm' }),
    }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(sendSmsMock).toHaveBeenCalledWith('+14165551234', 'hello from dlm')
    expect(json).toEqual({
      success: true,
      destination: '***1234',
      message_length: 14,
    })
  })

  it('returns 502 when Twilio rejects the send', async () => {
    createServerSupabaseClientMock.mockReturnValue(makeSupabase({ id: 'u1' }, 'admin'))
    isTwilioConfiguredMock.mockReturnValue(true)
    sendSmsMock.mockResolvedValue(false)

    const { POST } = await import('@/app/api/twilio/test/route')
    const response = await POST(new NextRequest('http://localhost/api/twilio/test', {
      method: 'POST',
      body: JSON.stringify({ phone_number: '+14165551234' }),
    }))
    const json = await response.json()

    expect(response.status).toBe(502)
    expect(json).toEqual({ error: 'Failed to send test SMS' })
  })
})
