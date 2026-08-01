// ============================================================================
// QUOTA + FEATURE GATING — server-side enforcement helpers
// ============================================================================
// Thin, pure wrappers over licensing/features so create paths and module routes
// can gate consistently. Both return an error message string when blocked, or
// null when allowed — an unlimited limit / enabled feature is always allowed,
// so gating is a no-op for the platform tenant (unlimited by default).

import { canAllocate, quotaStatus } from './licensing'
import { isFeatureEnabled, type FeatureFlags, type FeatureKey } from './features'

/** Message when allocating `count` more would breach the limit; null if allowed. */
export function quotaBlockMessage(limit: number, used: number, count: number, label: string): string | null {
  if (canAllocate(limit, used, count)) return null
  const s = quotaStatus(limit, used)
  return `${label} limit reached (${s.used}/${s.limit}). Upgrade the plan to add more.`
}

/** Message when a feature/module isn't enabled; null if enabled. */
export function featureBlockMessage(features: FeatureFlags, key: FeatureKey, label: string): string | null {
  return isFeatureEnabled(features, key) ? null : `${label} is not enabled on this plan.`
}
