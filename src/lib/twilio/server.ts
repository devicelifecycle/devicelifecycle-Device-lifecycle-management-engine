import twilio from 'twilio'

if (typeof window !== 'undefined') {
  throw new Error('Twilio server module cannot be imported in the browser')
}

let twilioClient: ReturnType<typeof twilio> | null = null

export type TwilioConfig = {
  accountSid: string
  authToken: string
  phoneNumber: string
}

export function getTwilioConfig(): TwilioConfig | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER

  if (!accountSid || !authToken || !phoneNumber) {
    return null
  }

  return {
    accountSid,
    authToken,
    phoneNumber,
  }
}

export function isTwilioConfigured(): boolean {
  return Boolean(getTwilioConfig())
}

export function getTwilioClient(): ReturnType<typeof twilio> | null {
  const config = getTwilioConfig()
  if (!config) return null

  if (!twilioClient) {
    twilioClient = twilio(config.accountSid, config.authToken)
  }

  return twilioClient
}

export function getTwilioMaskedStatus() {
  const config = getTwilioConfig()

  const maskSid = (value?: string): string | null => {
    if (!value) return null
    if (value.length <= 8) return value
    return `${value.slice(0, 4)}...${value.slice(-4)}`
  }

  const maskPhone = (value?: string): string | null => {
    if (!value) return null
    const digits = value.replace(/\D/g, '')
    if (digits.length < 4) return value
    return `***${digits.slice(-4)}`
  }

  return {
    configured: Boolean(config),
    account_sid: maskSid(config?.accountSid),
    phone_number: maskPhone(config?.phoneNumber),
  }
}
