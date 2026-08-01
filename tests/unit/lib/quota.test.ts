import { describe, it, expect } from 'vitest'
import { quotaBlockMessage, featureBlockMessage } from '@/lib/quota'
import { UNLIMITED } from '@/lib/licensing'
import { DEFAULT_FEATURES } from '@/lib/features'

describe('quota gating', () => {
  it('allows within the limit', () => {
    expect(quotaBlockMessage(100, 40, 1, 'Customers')).toBeNull()
  })

  it('blocks at/over the limit with a helpful message', () => {
    const msg = quotaBlockMessage(100, 100, 1, 'Customers')
    expect(msg).toContain('Customers limit reached')
    expect(msg).toContain('100/100')
  })

  it('is a no-op for unlimited (platform tenant default)', () => {
    expect(quotaBlockMessage(UNLIMITED, 9_999_999, 1000, 'Users')).toBeNull()
  })
})

describe('feature gating', () => {
  it('blocks a disabled module', () => {
    expect(featureBlockMessage(DEFAULT_FEATURES, 'sso', 'SSO')).toContain('not enabled')
  })

  it('allows an enabled module', () => {
    expect(featureBlockMessage({ ...DEFAULT_FEATURES, sso: true }, 'sso', 'SSO')).toBeNull()
    expect(featureBlockMessage(DEFAULT_FEATURES, 'billing', 'Billing')).toBeNull()
  })
})
