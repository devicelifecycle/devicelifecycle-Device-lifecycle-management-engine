import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerProvider, getProvider, hasProvider, listProviders,
  type PaymentProvider, type PaymentProviderCapabilities,
} from '@/lib/payment-provider'

function makeMockProvider(type: 'stripe' | 'manual'): PaymentProvider {
  const caps: PaymentProviderCapabilities = {
    cards: true, eft: false, wallets: false, hostedCheckout: false, recurring: false,
  }
  return {
    type,
    capabilities: caps,
    createCustomer: async () => ({ providerCustomerId: 'cust_test' }),
    createSetupIntent: async () => ({ clientSecret: 'cs_test', setupIntentId: 'si_test' }),
    attachPaymentMethod: async () => ({
      providerMethodId: 'pm_test', brand: 'visa', last4: '4242', expMonth: 12, expYear: 2030,
    }),
    charge: async () => ({ providerChargeId: 'ch_test', status: 'succeeded' }),
    refund: async () => ({ providerRefundId: 're_test', status: 'succeeded' }),
    verifyWebhook: () => ({}),
  }
}

describe('PaymentProvider registry', () => {
  beforeEach(() => {
    // Clear registry by re-registering (no clear function exposed)
  })

  it('registers and retrieves a provider', () => {
    registerProvider(makeMockProvider('stripe'))
    expect(hasProvider('stripe')).toBe(true)
    expect(getProvider('stripe').type).toBe('stripe')
  })

  it('throws for an unregistered provider', () => {
    expect(() => getProvider('manual')).toThrow('not registered')
  })

  it('lists registered providers', () => {
    registerProvider(makeMockProvider('stripe'))
    expect(listProviders()).toContain('stripe')
  })

  it('provider capabilities are accessible', () => {
    registerProvider(makeMockProvider('stripe'))
    const p = getProvider('stripe')
    expect(p.capabilities.cards).toBe(true)
    expect(p.capabilities.recurring).toBe(false)
  })
})
