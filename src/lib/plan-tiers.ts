// ============================================================================
// SUBSCRIPTION TIERS — two-tier per-seat product model
// ============================================================================
// The platform is sold as a SaaS subscription priced per seat per month.
// Two tiers:
//   • Individual  ($40/seat/mo) — full platform under Byte-Back branding
//   • Enterprise  ($70/seat/mo) — white-labeled with custom domain & branding
//
// "Seat" = one named user. The seat count is the number of active users on the
// tenant's subscription. Feature keys come from ./features.ts and are the SAME
// keys the runtime gates on, so including a feature in a tier is what actually
// turns it on.

import type { FeatureKey } from '@/lib/features'
import type { LimitKey } from '@/lib/licensing'
import { UNLIMITED } from '@/lib/licensing'

export const TIER_SLUGS = ['individual', 'enterprise'] as const
export type TierSlug = (typeof TIER_SLUGS)[number]

export interface PlanTier {
  slug: TierSlug
  name: string
  tagline: string
  bestFor: string
  /** Per-seat monthly price in CAD. */
  pricePerSeat: number
  currency: 'CAD'
  features: FeatureKey[]
  limits: Record<LimitKey, number>
  highlights: string[]
  inheritsFrom?: TierSlug
  roadmap?: { label: string; note: string }[]
  contactSales?: boolean
}

export const PLAN_TIERS: PlanTier[] = [
  {
    slug: 'individual',
    name: 'Individual',
    tagline: 'Run trade-in and CPO programs under the Byte-Back platform.',
    bestFor: 'A reseller running a device program under the Byte-Back brand.',
    pricePerSeat: 40,
    currency: 'CAD',
    features: [
      'trade_in', 'cpo', 'rve',
      'billing', 'reporting', 'notifications',
      'knowledge_base', 'chat', 'impersonation',
    ],
    limits: {
      customers: 500,
      users: 50,
      storageMb: 50_000,
      apiCallsPerMonth: 0,
      transactionsPerMonth: 2_500,
    },
    highlights: [
      'Trade-in and CPO order workflows, quote to payment',
      'Device catalog, IMEI intake, triage and exception handling',
      'Customer and vendor management',
      'Shipping, SLA tracking and automated email/SMS notifications',
      'Residual Value Estimator — forward-looking buyback quotes',
      'Roll-up reporting by region and by rep, with exports',
      'Knowledge base, support tickets and AI assistant',
      'Platform-branded portal (Byte-Back)',
    ],
  },
  {
    slug: 'enterprise',
    name: 'Enterprise',
    tagline: 'White-label the platform with your own brand, domain and identity.',
    bestFor: 'A company that wants its customers to see its own brand, not Byte-Back.',
    pricePerSeat: 70,
    currency: 'CAD',
    inheritsFrom: 'individual',
    features: [
      'trade_in', 'cpo', 'rve',
      'billing', 'reporting', 'notifications',
      'knowledge_base', 'chat', 'impersonation',
      'api_access', 'white_label',
    ],
    roadmap: [
      {
        label: 'Single sign-on (SAML / OIDC)',
        note: 'Not built. The identity provider has not been chosen.',
      },
    ],
    limits: {
      customers: UNLIMITED,
      users: UNLIMITED,
      storageMb: UNLIMITED,
      apiCallsPerMonth: 1_000_000,
      transactionsPerMonth: UNLIMITED,
    },
    highlights: [
      'Full white-label branding: your name, logo, colors and email identity',
      'Custom domain (e.g., portal.yourcompany.com)',
      'Read-only REST API (/api/v1) with scoped keys',
      'Unlimited customers, users, storage and transactions',
      'Tenant-level security controls: enforced MFA, IP allowlist, password policy',
      'Delegated roles: entity admin, regional manager, sales rep',
      'Data retention policies',
      'Priority support with an agreed response time',
    ],
  },
]

export function tierBySlug(slug: string): PlanTier | undefined {
  return PLAN_TIERS.find((t) => t.slug === slug)
}

export function incrementalFeatures(slug: TierSlug): FeatureKey[] {
  const tier = tierBySlug(slug)
  if (!tier) return []
  const below = tier.inheritsFrom ? tierBySlug(tier.inheritsFrom) : undefined
  if (!below) return tier.features
  return tier.features.filter((f) => !below.features.includes(f))
}

export function tierIncludes(slug: string, feature: FeatureKey): boolean {
  return tierBySlug(slug)?.features.includes(feature) ?? false
}

export function lowestTierWith(feature: FeatureKey): PlanTier | undefined {
  return PLAN_TIERS.find((t) => t.features.includes(feature))
}

export function tierToPlanRow(tier: PlanTier) {
  const features: Partial<Record<FeatureKey, boolean>> = {}
  for (const f of tier.features) features[f] = true
  return {
    slug: tier.slug,
    name: tier.name,
    price_per_seat: tier.pricePerSeat,
    currency: tier.currency,
    features,
    limits: tier.limits,
    is_active: true,
  }
}

export function nextTierAbove(slug: string): PlanTier | undefined {
  const i = PLAN_TIERS.findIndex((t) => t.slug === slug)
  return i >= 0 ? PLAN_TIERS[i + 1] : undefined
}

export function isPriced(tier: PlanTier): boolean {
  return tier.pricePerSeat > 0
}
