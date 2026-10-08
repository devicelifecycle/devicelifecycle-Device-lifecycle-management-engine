// ============================================================================
// PAYMENT PROVIDER — interface + registry
// ============================================================================
// One interface, many adapters. Recurring is platform-managed: our cron
// computes what is owed and calls charge(), rather than delegating subscription
// management to the gateway. One subscription engine, many ways to collect.
//
// PCI scope: card data NEVER touches our servers. Every adapter uses the
// provider's hosted fields / redirect. SAQ-A.

export type PaymentProviderType = 'stripe' | 'manual'

export interface PaymentProviderCapabilities {
  cards: boolean
  eft: boolean
  wallets: boolean
  hostedCheckout: boolean
  recurring: boolean
}

export interface CreateCustomerResult {
  providerCustomerId: string
}

export interface AttachPaymentMethodResult {
  providerMethodId: string
  brand: string | null
  last4: string | null
  expMonth: number | null
  expYear: number | null
}

export interface ChargeResult {
  providerChargeId: string
  status: 'succeeded' | 'pending' | 'failed'
  failureReason?: string
}

export interface RefundResult {
  providerRefundId: string
  status: 'succeeded' | 'pending' | 'failed'
}

export interface SetupIntentResult {
  clientSecret: string
  setupIntentId: string
}

export interface PaymentProvider {
  readonly type: PaymentProviderType
  readonly capabilities: PaymentProviderCapabilities

  createCustomer(params: {
    tenantId: string
    name: string
    email: string
  }): Promise<CreateCustomerResult>

  createSetupIntent(params: {
    providerCustomerId: string
  }): Promise<SetupIntentResult>

  attachPaymentMethod(params: {
    providerCustomerId: string
    providerMethodId: string
  }): Promise<AttachPaymentMethodResult>

  charge(params: {
    providerCustomerId: string
    providerMethodId: string
    amountCents: number
    currency: string
    idempotencyKey: string
    description?: string
    metadata?: Record<string, string>
  }): Promise<ChargeResult>

  refund(params: {
    providerChargeId: string
    amountCents?: number
  }): Promise<RefundResult>

  verifyWebhook(params: {
    rawBody: string | Buffer
    signature: string
  }): unknown
}

// ── Registry ────────────────────────────────────────────────────────────────

const providers = new Map<PaymentProviderType, PaymentProvider>()

export function registerProvider(provider: PaymentProvider): void {
  providers.set(provider.type, provider)
}

export function getProvider(type: PaymentProviderType): PaymentProvider {
  const provider = providers.get(type)
  if (!provider) throw new Error(`Payment provider "${type}" is not registered`)
  return provider
}

export function hasProvider(type: PaymentProviderType): boolean {
  return providers.has(type)
}

export function listProviders(): PaymentProviderType[] {
  return Array.from(providers.keys())
}
