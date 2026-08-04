import { describe, it, expect } from 'vitest'
import { resolveIntegrations, DEFAULT_INTEGRATIONS } from '@/lib/integrations-config'

describe('integrations config resolver', () => {
  it('empty/invalid → nothing configured', () => {
    expect(resolveIntegrations(null)).toEqual(DEFAULT_INTEGRATIONS)
    expect(resolveIntegrations({})).toEqual(DEFAULT_INTEGRATIONS)
    expect(resolveIntegrations('x')).toEqual(DEFAULT_INTEGRATIONS)
  })

  it('accepts known providers and rejects unknown ones', () => {
    expect(resolveIntegrations({ smsProvider: 'twilio' }).smsProvider).toBe('twilio')
    expect(resolveIntegrations({ smsProvider: 'nexmo' }).smsProvider).toBe('none')
    expect(resolveIntegrations({ paymentProvider: 'stripe' }).paymentProvider).toBe('stripe')
    expect(resolveIntegrations({ ssoProvider: 'saml' }).ssoProvider).toBe('saml')
    expect(resolveIntegrations({ ssoProvider: 'ldap' }).ssoProvider).toBe('none')
  })

  it('validates SMTP port range and trims strings', () => {
    expect(resolveIntegrations({ smtpPort: 587, smtpHost: ' smtp.acme.com ' }).smtpPort).toBe(587)
    expect(resolveIntegrations({ smtpPort: 99999 }).smtpPort).toBeNull()
    expect(resolveIntegrations({ smtpPort: 0 }).smtpPort).toBeNull()
    expect(resolveIntegrations({ smtpHost: ' smtp.acme.com ' }).smtpHost).toBe('smtp.acme.com')
  })

  it('never carries secret-looking fields through', () => {
    const out = resolveIntegrations({ smtpPassword: 'hunter2', apiKey: 'sk_live_x', smtpHost: 'h' })
    expect(out).not.toHaveProperty('smtpPassword')
    expect(out).not.toHaveProperty('apiKey')
    expect(out.smtpHost).toBe('h')
  })
})
