import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const createServerSupabaseClientMock = vi.fn()
const isTwilioConfiguredMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}))

vi.mock('@/services/email.service', () => ({
  EmailService: {
    isTwilioConfigured: isTwilioConfiguredMock,
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

describe('GET /api/twilio/health', () => {
  const originalSid = process.env.TWILIO_ACCOUNT_SID
  const originalPhone = process.env.TWILIO_PHONE_NUMBER

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.TWILIO_ACCOUNT_SID = 'AC1234567890abcdef1234567890abcd'
    process.env.TWILIO_PHONE_NUMBER = '+14165551234'
  })

  afterAll(() => {
    process.env.TWILIO_ACCOUNT_SID = originalSid
    process.env.TWILIO_PHONE_NUMBER = originalPhone
  })

  it('returns 401 when not authenticated', async () => {
    createServerSupabaseClientMock.mockReturnValue(makeSupabase(null))

    const { GET } = await import('@/app/api/twilio/health/route')
    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(401)
    expect(json).toEqual({ error: 'Unauthorized' })
  })

  it('returns 403 for non-admin users', async () => {
    createServerSupabaseClientMock.mockReturnValue(makeSupabase({ id: 'u1' }, 'sales'))

    const { GET } = await import('@/app/api/twilio/health/route')
    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(403)
    expect(json).toEqual({ error: 'Forbidden' })
  })

  it('returns Twilio readiness details for admins', async () => {
    createServerSupabaseClientMock.mockReturnValue(makeSupabase({ id: 'u1' }, 'admin'))
    isTwilioConfiguredMock.mockReturnValue(true)

    const { GET } = await import('@/app/api/twilio/health/route')
    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.provider).toBe('twilio')
    expect(json.twilio.configured).toBe(true)
    expect(json.twilio.account_sid).toBe('AC12...abcd')
    expect(json.twilio.phone_number).toBe('***1234')
    expect(json.sms_delivery.works_without_carrier).toBe(true)
    expect(json.sms_delivery.destination_required).toBe(true)
  })
})
