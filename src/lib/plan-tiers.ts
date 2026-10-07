// ============================================================================
// SUBSCRIPTION TIERS — the canonical three-tier product model
// ============================================================================
// The platform is sold as a SaaS subscription: a VAR subscribes to a tier and
// gets the features and capacity that tier includes. This file is the single
// source of truth for what each tier contains — the pricing page, the admin
// plan editor, the signup flow and the entitlement checks all read from here,
// so a tier can never mean one thing on the marketing page and another in the
// product.
//
// PRICING IS DELIBERATELY UNSET. Every tier carries `monthlyPrice: null`
// ("to be confirmed") until the client approves the commercial model — see
// docs/CLIENT_APPROVAL_SUBSCRIPTION_MODEL.md. Null is not zero: a null price
// means "not yet decided" and the UI says so, where a 0 would read as free and
// quietly bill nobody.
//
// Feature keys come from ./features.ts and are the SAME keys the runtime gates
// on, so including a feature in a tier is what actually turns it on.

import type { FeatureKey } from '@/lib/features'
import type { LimitKey } from '@/lib/licensing'
import { UNLIMITED } from '@/lib/licensing'

export const TIER_SLUGS = ['essentials', 'professional', 'enterprise'] as const
export type TierSlug = (typeof TIER_SLUGS)[number]

export interface PlanTier {
  slug: TierSlug
  name: string
  /** One line for the pricing page — what this tier is FOR, not what it costs. */
  tagline: string
  /** Who it suits — helps a buyer self-select without talking to sales. */
  bestFor: string
  /** null = to be confirmed with the client. Never 0, which would read as free. */
  monthlyPrice: number | null
  currency: 'CAD'
  /** Everything this tier switches on. Enforced by featureGate() at runtime. */
  features: FeatureKey[]
  /** Capacity. -1 (UNLIMITED) where a tier is uncapped. Enforced on create paths. */
  limits: Record<LimitKey, number>
  /** Plain-English capability lines for the pricing page. */
  highlights: string[]
  /** Shown as "everything in X, plus…" so the ladder is obvious. */
  inheritsFrom?: TierSlug
  /**
   * Capabilities promised for this tier that are NOT built yet. Kept separate
   * from `features` on purpose: `features` is what the runtime switches on, so
   * putting an unbuilt capability there would sell something that cannot be
   * delivered. These are shown to a buyer as explicitly planned, with no date
   * implied, and they gate nothing.
   */
  roadmap?: { label: string; note: string }[]
  /** Sales-assisted rather than self-serve checkout. */
  contactSales?: boolean
}

/**
 * The ladder is strictly additive: every tier contains everything below it.
 * A buyer should never have to give something up to move up, and support
 * should never have to explain why upgrading lost them a feature.
 */
export const PLAN_TIERS: PlanTier[] = [
  {
    slug: 'essentials',
    name: 'Essentials',
    tagline: 'Run trade-in and certified pre-owned programs end to end.',
    bestFor: 'A reseller starting a device program, or one team running it.',
    monthlyPrice: null,
    currency: 'CAD',
    features: ['trade_in', 'cpo', 'notifications', 'knowledge_base'],
    limits: {
      customers: 50,
      users: 10,
      storageMb: 5_000,
      apiCallsPerMonth: 0,
      transactionsPerMonth: 250,
    },
    highlights: [
      'Trade-in and CPO order workflows, quote to payment',
      'Device catalog, IMEI intake, triage and exception handling',
      'Customer and vendor management',
      'Shipping, SLA tracking and automated email/SMS notifications',
      'Knowledge base and support tickets',
      'Your branding on the portal and on everything your customers receive',
    ],
  },
  {
    slug: 'professional',
    name: 'Professional',
    tagline: 'Add pricing intelligence, reporting and customer billing.',
    bestFor: 'A reseller running the program as a business line, with a team and targets.',
    monthlyPrice: null,
    currency: 'CAD',
    inheritsFrom: 'essentials',
    features: ['trade_in', 'cpo', 'notifications', 'knowledge_base', 'rve', 'reporting', 'chat', 'billing'],
    limits: {
      customers: 500,
      users: 50,
      storageMb: 50_000,
      apiCallsPerMonth: 0,
      transactionsPerMonth: 2_500,
    },
    highlights: [
      'Residual Value Estimator — forward-looking buyback quotes',
      'Roll-up reporting by region and by rep, with exports',
      'Delegated roles: entity admin, regional manager, sales rep',
      'In-platform customer invoicing with tax and balance tracking',
      'AI assistant for pricing, triage and sourcing questions',
      'Custom domain',
    ],
  },
  {
    slug: 'enterprise',
    name: 'Enterprise',
    tagline: 'Integrate the platform into your own systems, at scale.',
    bestFor: 'A distributor or carrier with existing systems and compliance requirements.',
    monthlyPrice: null,
    currency: 'CAD',
    inheritsFrom: 'professional',
    contactSales: true,
    features: [
      'trade_in', 'cpo', 'notifications', 'knowledge_base',
      'rve', 'reporting', 'chat', 'billing',
      'api_access',
    ],
    roadmap: [
      {
        label: 'Single sign-on (SAML / OIDC)',
        note: 'Not built. The identity provider has not been chosen — see the approval questions.',
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
      'Read-only REST API (/api/v1) with scoped keys',
      'Unlimited customers, users, storage and transactions',
      'Tenant-level security controls: enforced MFA, IP allowlist, password policy',
      'Data retention policies',
      'Priority support with an agreed response time',
    ],
  },
]

export function tierBySlug(slug: string): PlanTier | undefined {
  return PLAN_TIERS.find((t) => t.slug === slug)
}

/**
 * Features a tier adds on top of the one below — what the pricing page shows
 * after "everything in X, plus…". Derived rather than hand-maintained so the
 * two lists can never disagree.
 */
export function incrementalFeatures(slug: TierSlug): FeatureKey[] {
  const tier = tierBySlug(slug)
  if (!tier) return []
  const below = tier.inheritsFrom ? tierBySlug(tier.inheritsFrom) : undefined
  if (!below) return tier.features
  return tier.features.filter((f) => !below.features.includes(f))
}

/** Is `feature` included in `slug`? The question entitlement checks ask. */
export function tierIncludes(slug: string, feature: FeatureKey): boolean {
  return tierBySlug(slug)?.features.includes(feature) ?? false
}

/**
 * The cheapest tier that includes a feature — so an upgrade prompt can name
 * the right tier instead of saying "upgrade your plan" and leaving the buyer
 * to work out which one.
 */
export function lowestTierWith(feature: FeatureKey): PlanTier | undefined {
  return PLAN_TIERS.find((t) => t.features.includes(feature))
}

/** Shape a tier for storage in `subscription_plans` (features/limits JSON). */
export function tierToPlanRow(tier: PlanTier) {
  const features: Partial<Record<FeatureKey, boolean>> = {}
  for (const f of tier.features) features[f] = true
  return {
    slug: tier.slug,
    name: tier.name,
    monthly_price: tier.monthlyPrice,
    currency: tier.currency,
    features,
    limits: tier.limits,
    is_active: true,
  }
}

/** True once the client has signed off and a real price exists. */
export function isPriced(tier: PlanTier): boolean {
  return typeof tier.monthlyPrice === 'number' && tier.monthlyPrice > 0
}
