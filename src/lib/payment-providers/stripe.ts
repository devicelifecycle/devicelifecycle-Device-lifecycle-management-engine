// ============================================================================
// STRIPE ADAPTER — PaymentProvider implementation for Stripe
// ============================================================================
// Uses Stripe's hosted fields for card collection (PCI SAQ-A). Card data never
// touches our servers — we only receive tokenized PaymentMethod IDs.
//
// Requires STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET env vars. When they are
// not set, the provider is not registered and the platform operates in manual
// payment mode only.

import Stripe from 'stripe'
import {
  type PaymentProvider, type PaymentProviderCapabilities,
  type CreateCustomerResult, type AttachPaymentMethodResult,
  type ChargeResult, type RefundResult, type SetupIntentResult,
  registerProvider,
} from '@/lib/payment-provider'
import { readServerEnv } from '@/lib/server-env'

let stripeClient: Stripe | null = null

function getStripe(): Stripe {
  if (stripeClient) return stripeClient
  const key = readServerEnv('STRIPE_SECRET_KEY')
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured')
  stripeClient = new Stripe(key, { apiVersion: '2026-09-30.endive' })
  return stripeClient
}

export function isStripeConfigured(): boolean {
  return !!readServerEnv('STRIPE_SECRET_KEY')
}

export function getWebhookSecret(): string {
  const secret = readServerEnv('STRIPE_WEBHOOK_SECRET')
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not configured')
  return secret
}

const stripeProvider: PaymentProvider = {
  type: 'stripe',

  capabilities: {
    cards: true,
    eft: true,
    wallets: true,
    hostedCheckout: true,
    recurring: false, // platform-managed recurring, not Stripe subscriptions
  } satisfies PaymentProviderCapabilities,

  async createCustomer({ tenantId, name, email }): Promise<CreateCustomerResult> {
    const stripe = getStripe()
    const customer = await stripe.customers.create({
      name,
      email,
      metadata: { tenant_id: tenantId },
    })
    return { providerCustomerId: customer.id }
  },

  async createSetupIntent({ providerCustomerId }): Promise<SetupIntentResult> {
    const stripe = getStripe()
    const intent = await stripe.setupIntents.create({
      customer: providerCustomerId,
      automatic_payment_methods: { enabled: true },
    })
    return {
      clientSecret: intent.client_secret!,
      setupIntentId: intent.id,
    }
  },

  async attachPaymentMethod({ providerCustomerId, providerMethodId }): Promise<AttachPaymentMethodResult> {
    const stripe = getStripe()
    const pm = await stripe.paymentMethods.attach(providerMethodId, {
      customer: providerCustomerId,
    })
    await stripe.customers.update(providerCustomerId, {
      invoice_settings: { default_payment_method: providerMethodId },
    })
    return {
      providerMethodId: pm.id,
      brand: pm.card?.brand ?? null,
      last4: pm.card?.last4 ?? null,
      expMonth: pm.card?.exp_month ?? null,
      expYear: pm.card?.exp_year ?? null,
    }
  },

  async charge({ providerCustomerId, providerMethodId, amountCents, currency, idempotencyKey, description, metadata }): Promise<ChargeResult> {
    const stripe = getStripe()
    try {
      const intent = await stripe.paymentIntents.create(
        {
          amount: amountCents,
          currency: currency.toLowerCase(),
          customer: providerCustomerId,
          payment_method: providerMethodId,
          confirm: true,
          off_session: true,
          description,
          metadata: metadata ?? {},
        },
        { idempotencyKey },
      )

      if (intent.status === 'succeeded') {
        return { providerChargeId: intent.id, status: 'succeeded' }
      }
      return {
        providerChargeId: intent.id,
        status: 'pending',
        failureReason: intent.status === 'requires_action' ? 'requires_action' : undefined,
      }
    } catch (err) {
      if (err instanceof Stripe.errors.StripeCardError) {
        return {
          providerChargeId: (err as unknown as { payment_intent?: { id?: string } }).payment_intent?.id ?? '',
          status: 'failed',
          failureReason: err.message,
        }
      }
      throw err
    }
  },

  async refund({ providerChargeId, amountCents }): Promise<RefundResult> {
    const stripe = getStripe()
    const refund = await stripe.refunds.create(
      {
        payment_intent: providerChargeId,
        ...(amountCents !== undefined ? { amount: amountCents } : {}),
      },
      { idempotencyKey: `refund_${providerChargeId}_${amountCents ?? 'full'}` },
    )
    return {
      providerRefundId: refund.id,
      status: refund.status === 'succeeded' ? 'succeeded' : 'pending',
    }
  },

  verifyWebhook({ rawBody, signature }) {
    const stripe = getStripe()
    const secret = getWebhookSecret()
    return stripe.webhooks.constructEvent(
      typeof rawBody === 'string' ? rawBody : rawBody.toString(),
      signature,
      secret,
    )
  },
}

export function initStripeProvider(): void {
  if (isStripeConfigured()) {
    registerProvider(stripeProvider)
  }
}

export { stripeProvider }
