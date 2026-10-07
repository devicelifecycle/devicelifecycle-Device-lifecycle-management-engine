// ============================================================================
// QUOTA + FEATURE GATING — server-side enforcement helpers
// ============================================================================
// Thin, pure wrappers over licensing/features so create paths and module routes
// can gate consistently. Both return an error message string when blocked, or
// null when allowed — an unlimited limit / enabled feature is always allowed,
// so gating is a no-op for the platform tenant (unlimited by default).

import { canAllocate, quotaStatus } from './licensing'
import { isFeatureEnabled, type FeatureFlags, type FeatureKey } from './features'
import { lowestTierWith, nextTierAbove } from './plan-tiers'

/**
 * Message when allocating `count` more would breach the limit; null if allowed.
 *
 * Names the tier that would raise the limit when `currentTier` is known.
 * "Upgrade the plan" leaves the customer to work out which plan — the whole
 * point of a tiered product is that the answer is knowable, so say it.
 */
export function quotaBlockMessage(
  limit: number, used: number, count: number, label: string, currentTier?: string | null,
): string | null {
  if (canAllocate(limit, used, count)) return null
  const s = quotaStatus(limit, used)
  const next = currentTier ? nextTierAbove(currentTier) : undefined
  const advice = next
    ? `${next.name} raises this limit.`
    : 'Upgrade the plan to add more.'
  return `${label} limit reached (${s.used}/${s.limit}). ${advice}`
}

/**
 * Message when a feature/module isn't enabled; null if enabled.
 *
 * Names the cheapest tier that includes the feature, so the customer is told
 * what to do rather than only what they can't.
 */
export function featureBlockMessage(features: FeatureFlags, key: FeatureKey, label: string): string | null {
  if (isFeatureEnabled(features, key)) return null
  const tier = lowestTierWith(key)
  return tier
    ? `${label} is not included in your plan. It's available on ${tier.name}.`
    : `${label} is not enabled on this plan.`
}
