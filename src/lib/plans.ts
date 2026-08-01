// ============================================================================
// SUBSCRIPTION PLANS
// ============================================================================
// Plans bundle a monthly price + usage limits + enabled features, assigned to a
// VAR tenant via tenants.plan (slug). Pure helpers only; the catalog lives in
// the subscription_plans table.

import { resolveLicense, type LicenseLimits } from './licensing'
import { resolveFeatures, type FeatureFlags } from './features'

export interface SubscriptionPlan {
  id: string
  name: string
  slug: string
  monthlyPrice: number
  currency: string
  isActive: boolean
  limits: LicenseLimits
  features: FeatureFlags
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Normalize a raw plan row (defensive against partial/legacy records). */
export function normalizePlan(raw: unknown): SubscriptionPlan {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    id: typeof p.id === 'string' ? p.id : '',
    name: typeof p.name === 'string' && p.name.trim() ? p.name.trim() : 'Unnamed plan',
    slug: typeof p.slug === 'string' ? p.slug : '',
    monthlyPrice: typeof p.monthly_price === 'number' ? round2(Math.max(0, p.monthly_price)) : 0,
    currency: typeof p.currency === 'string' && p.currency ? p.currency : 'CAD',
    isActive: p.is_active !== false,
    limits: resolveLicense(p.limits),
    features: resolveFeatures(undefined, p.features),
  }
}

/** Annual value of a monthly price. */
export function annualize(monthlyPrice: number): number {
  return round2(Math.max(0, monthlyPrice) * 12)
}

/** Monthly recurring revenue = sum of active tenants' assigned plan price. */
export function monthlyRecurringRevenue(
  tenants: Array<{ isActive: boolean; planPrice: number }>,
): number {
  return round2(
    tenants.reduce((sum, t) => (t.isActive ? sum + Math.max(0, t.planPrice) : sum), 0),
  )
}
