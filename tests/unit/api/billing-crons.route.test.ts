import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { memoryDb } from '../../helpers/memory-db'
import { renewalAmounts } from '@/lib/renewal-charge'

let db: ReturnType<typeof memoryDb>
const charge = vi.fn()
const renew = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({ createServiceRoleClient: () => db }))
vi.mock('@/lib/payment-providers/stripe', () => ({ initStripeProvider: () => {} }))
vi.mock('@/lib/payment-provider', () => ({ hasProvider: () => true, getProvider: () => ({ charge }) }))
vi.mock('@/lib/subscription-service', () => ({ renewSubscription: (...a: unknown[]) => renew(...a) }))
vi.mock('@/lib/cron-logging', () => ({ logCronSuccess: vi.fn(), logCronFailure: vi.fn() }))
vi.mock('@/services/email.service', () => ({ EmailService: { sendSubscriptionPastDueEmail: vi.fn().mockResolvedValue(true) } }))
vi.mock('@/lib/app-url', () => ({ getAppPath: (p: string) => p }))

const T = 'var-1'
function seed(sub: Record<string, unknown>) {
  db = memoryDb({
    subscriptions: [{ id: 'sub-1', tenant_id: T, plan_slug: 'individual', billing_interval: 'month', cancel_at_period_end: false, credit_balance_cents: 0, payment_method_id: null, ...sub }],
    users: [
      { tenant_id: T, role: 'var_entity_admin', is_active: true },
      { tenant_id: T, role: 'var_sales_rep', is_active: true },
      { tenant_id: T, role: 'customer', is_active: true },  // end customer: never a seat
      { tenant_id: T, role: 'customer', is_active: true },
      { tenant_id: T, role: 'var_sales_rep', is_active: false },
    ],
    organizations: [{ tenant_id: T, address: { state: 'ON', country: 'CA' } }],
    payment_methods: [{ id: 'pm-row', tenant_id: T, provider_token: 'pm_card_visa', provider_customer_id: 'cus_1', is_default: true, is_active: true }],
    payment_charges: [], subscription_events: [],
  })
}
const req = () => new NextRequest('http://x/api/cron', { headers: { authorization: 'Bearer test-cron' } })

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = 'test-cron'
  charge.mockResolvedValue({ providerChargeId: 'pi_1', status: 'succeeded' })
})

describe('renewalAmounts', () => {
  it('seats × price, ×12 yearly, plus tax, minus credit', () => {
    expect(renewalAmounts(40, 2, 'month', 0.13, 0)).toMatchObject({ grossDollars: 80, taxDollars: 10.4, grossCents: 9040, netChargeCents: 9040, creditUsed: 0 })
    expect(renewalAmounts(40, 2, 'year', 0, 0).grossCents).toBe(96000)
    expect(renewalAmounts(40, 1, 'month', 0.13, 5000)).toMatchObject({ grossCents: 4520, creditUsed: 4520, netChargeCents: 0 })
  })
})

describe('recurring-charge cron', () => {
  it('charges 2 staff seats + 13% HST to the default card when the subscription has no card set', async () => {
    seed({ status: 'active', current_period_end: '2020-01-01T00:00:00Z' })
    const { GET } = await import('@/app/api/cron/recurring-charge/route')
    const res = await (await GET(req())).json()
    expect(res).toMatchObject({ charged: 1, renewed: 1, skippedNoMethod: 0 })
    expect(charge).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 9040, providerCustomerId: 'cus_1', providerMethodId: 'pm_card_visa', currency: 'CAD' }))
    expect(db.tables.payment_charges[0]).toMatchObject({ amount_cents: 9040, payment_method_id: 'pm-row', status: 'succeeded' })
    expect(renew).toHaveBeenCalledWith(db, 'sub-1')
  })

  it('no active card → skipped, nothing charged', async () => {
    seed({ status: 'active', current_period_end: '2020-01-01T00:00:00Z' })
    db.tables.payment_methods[0].is_active = false
    const { GET } = await import('@/app/api/cron/recurring-charge/route')
    expect(await (await GET(req())).json()).toMatchObject({ charged: 0, skippedNoMethod: 1 })
    expect(charge).not.toHaveBeenCalled()
  })

  it('refuses without the cron secret', async () => {
    seed({ status: 'active', current_period_end: '2020-01-01T00:00:00Z' })
    const { GET } = await import('@/app/api/cron/recurring-charge/route')
    expect((await GET(new NextRequest('http://x/api/cron'))).status).toBe(401)
  })
})

describe('dunning-retry cron', () => {
  const pastDue = (days: number) => new Date(Date.now() - days * 86_400_000 - 3_600_000).toISOString()

  it('retries the SAME amount as the first attempt (tax included), on the default card', async () => {
    seed({ status: 'past_due', past_due_since: pastDue(1) })
    const { GET } = await import('@/app/api/cron/dunning-retry/route')
    const res = await (await GET(req())).json()
    expect(res).toMatchObject({ retried: 1, succeeded: 1 })
    expect(charge).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 9040, providerMethodId: 'pm_card_visa' }))
  })

  it('a credit that now covers the period settles without charging the card', async () => {
    seed({ status: 'past_due', past_due_since: pastDue(3), credit_balance_cents: 10_000 })
    const { GET } = await import('@/app/api/cron/dunning-retry/route')
    expect(await (await GET(req())).json()).toMatchObject({ succeeded: 1 })
    expect(charge).not.toHaveBeenCalled()
    expect(db.tables.subscriptions[0].credit_balance_cents).toBe(10_000 - 9040)
    expect(renew).toHaveBeenCalled()
  })

  it('not a retry day → untouched', async () => {
    seed({ status: 'past_due', past_due_since: pastDue(2) })
    const { GET } = await import('@/app/api/cron/dunning-retry/route')
    expect(await (await GET(req())).json()).toMatchObject({ skippedNotRetryDay: 1, retried: 0 })
  })
})
