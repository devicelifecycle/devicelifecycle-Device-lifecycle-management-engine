// ============================================================================
// RENEWAL CHARGE — what one subscription period costs, for every charge path
// ============================================================================
// Price per seat × billable seats × (12 for yearly), plus Canadian tax from the
// tenant's organization address, minus any credit balance. The first attempt
// (recurring-charge) and every retry (dunning-retry) must bill the SAME amount;
// the retry path used to charge the pre-tax price and ignore credit.

import type { createServiceRoleClient } from '@/lib/supabase/service-role'
import { tierBySlug, type PlanTier } from '@/lib/plan-tiers'
import { resolveTaxRate, computeTax } from '@/lib/tax'
import { countBillableSeats } from '@/lib/seats'

type Svc = ReturnType<typeof createServiceRoleClient>

export interface RenewalSubscription {
  tenant_id: string
  plan_slug: string
  billing_interval: string | null
  credit_balance_cents?: number | null
}

export interface RenewalCharge {
  tier: PlanTier
  seats: number
  grossDollars: number
  taxDollars: number
  taxLabel: string
  /** Total including tax, before credit. */
  grossCents: number
  creditUsed: number
  /** What to actually charge the card. */
  netChargeCents: number
}

/** Pure amount maths (unit-tested). */
export function renewalAmounts(pricePerSeat: number, seats: number, interval: string | null, taxRate: number, creditCents: number) {
  const grossDollars = pricePerSeat * seats * (interval === 'year' ? 12 : 1)
  const taxDollars = taxRate > 0 ? computeTax(grossDollars, taxRate) : 0
  const grossCents = Math.round((grossDollars + taxDollars) * 100)
  const credit = Math.max(0, creditCents ?? 0)
  return {
    grossDollars,
    taxDollars,
    grossCents,
    creditUsed: Math.min(credit, grossCents),
    netChargeCents: Math.max(0, grossCents - credit),
  }
}

/** Null when the plan has no per-seat price (nothing to charge). */
export async function computeRenewalCharge(supabase: Svc, sub: RenewalSubscription): Promise<RenewalCharge | null> {
  const tier = tierBySlug(sub.plan_slug)
  if (!tier?.pricePerSeat) return null
  const seats = await countBillableSeats(supabase, sub.tenant_id)
  const { data: org } = await supabase
    .from('organizations').select('address').eq('tenant_id', sub.tenant_id).limit(1).maybeSingle()
  const addr = org?.address as Record<string, unknown> | null
  const tax = resolveTaxRate((addr?.state ?? addr?.province ?? '') as string, (addr?.country ?? '') as string)
  return {
    tier,
    seats,
    taxLabel: tax.label,
    ...renewalAmounts(tier.pricePerSeat, seats, sub.billing_interval, tax.rate, sub.credit_balance_cents ?? 0),
  }
}
