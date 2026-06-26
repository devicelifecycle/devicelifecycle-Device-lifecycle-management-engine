import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const createServiceRoleClientMock = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: createServiceRoleClientMock,
}))

describe('EmailService smoke tests', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    // Ensure no real provider looks configured for these tests.
    delete process.env.GMAIL_USER
    delete process.env.GMAIL_APP_PASSWORD
    delete process.env.RESEND_API_KEY
    delete process.env.TWILIO_ACCOUNT_SID
    delete process.env.TWILIO_AUTH_TOKEN

    // logNotificationAttempt is fire-and-forget — give it a harmless mock
    // client so it doesn't throw trying to read real Supabase env vars.
    createServiceRoleClientMock.mockReturnValue({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockResolvedValue({ error: null }),
      }),
    })
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('sendEmail returns false (does not throw) when no provider is configured', async () => {
    const { EmailService } = await import('@/services/email.service')
    const result = await EmailService.sendEmail('test@example.com', 'Subject', '<p>body</p>')
    expect(result).toBe(false)
  })

  it('sendEmailWithAttachments returns false (does not throw) when no provider is configured', async () => {
    const { EmailService } = await import('@/services/email.service')
    const result = await EmailService.sendEmailWithAttachments(
      'test@example.com', 'Subject', '<p>body</p>',
      [{ filename: 'test.pdf', content: Buffer.from('x'), contentType: 'application/pdf' }]
    )
    expect(result).toBe(false)
  })

  it('sendSMS returns false (does not throw) for an invalid phone number', async () => {
    const { EmailService } = await import('@/services/email.service')
    const result = await EmailService.sendSMS('123', 'test message')
    expect(result).toBe(false)
  })

  it('sendSMS returns false (does not throw) when Twilio is not configured', async () => {
    const { EmailService } = await import('@/services/email.service')
    const result = await EmailService.sendSMS('4165551234', 'test message')
    expect(result).toBe(false)
  })

  it('isTwilioConfigured reflects missing Twilio env vars', async () => {
    const { EmailService } = await import('@/services/email.service')
    expect(EmailService.isTwilioConfigured()).toBe(false)
  })
})
