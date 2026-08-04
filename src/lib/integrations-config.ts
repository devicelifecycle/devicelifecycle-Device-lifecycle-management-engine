// ============================================================================
// INTEGRATIONS CONFIG — non-secret provider settings (per tenant / platform)
// ============================================================================
// Stored under settings.integrations. Holds only NON-SECRET configuration
// (provider names, hosts, from-addresses, SSO entity id). Secrets (SMTP
// passwords, API keys, payment keys) live in the secret store / env, never here.
// Empty resolves to "nothing configured", so this changes no live behavior.

export type SmsProvider = 'none' | 'twilio'
export type PaymentProvider = 'none' | 'stripe'
export type SsoProvider = 'none' | 'saml' | 'oidc'

export interface IntegrationsConfig {
  smsProvider: SmsProvider
  smsFrom: string | null
  smtpHost: string | null
  smtpPort: number | null
  smtpUser: string | null
  paymentProvider: PaymentProvider
  ssoProvider: SsoProvider
  ssoEntityId: string | null
}

export const DEFAULT_INTEGRATIONS: IntegrationsConfig = {
  smsProvider: 'none', smsFrom: null,
  smtpHost: null, smtpPort: null, smtpUser: null,
  paymentProvider: 'none', ssoProvider: 'none', ssoEntityId: null,
}

const str = (v: unknown, max = 255): string | null =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback

export function resolveIntegrations(raw: unknown): IntegrationsConfig {
  const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const port = typeof s.smtpPort === 'number' && s.smtpPort >= 1 && s.smtpPort <= 65535 ? Math.floor(s.smtpPort) : null
  return {
    smsProvider: oneOf(s.smsProvider, ['none', 'twilio'] as const, 'none'),
    smsFrom: str(s.smsFrom, 40),
    smtpHost: str(s.smtpHost),
    smtpPort: port,
    smtpUser: str(s.smtpUser),
    paymentProvider: oneOf(s.paymentProvider, ['none', 'stripe'] as const, 'none'),
    ssoProvider: oneOf(s.ssoProvider, ['none', 'saml', 'oidc'] as const, 'none'),
    ssoEntityId: str(s.ssoEntityId, 300),
  }
}
