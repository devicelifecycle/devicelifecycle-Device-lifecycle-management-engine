// ============================================================================
// FEATURE FLAGS — per-VAR / global module enablement
// ============================================================================
// The outline's "Feature availability" + Enterprise Best Practice: let the
// platform admin enable/disable modules globally or per VAR. Resolved from
// DEFAULT_FEATURES, then platform-global overrides, then per-tenant overrides.

export const FEATURE_KEYS = [
  'trade_in', 'cpo', 'rve',
  'billing', 'reporting', 'notifications',
  'api_access', 'sso', 'vendor_auction',
  'knowledge_base', 'chat', 'impersonation',
] as const

export type FeatureKey = (typeof FEATURE_KEYS)[number]
export type FeatureFlags = Record<FeatureKey, boolean>

/** Core modules on by default; advanced/optional ones off until enabled. */
export const DEFAULT_FEATURES: FeatureFlags = {
  trade_in: true,
  cpo: true,
  rve: true,
  billing: true,
  reporting: true,
  notifications: true,
  api_access: false,
  sso: false,
  vendor_auction: false,
  knowledge_base: false,
  chat: false,
  impersonation: false,
}

function pickBooleans(raw: unknown): Partial<FeatureFlags> {
  if (!raw || typeof raw !== 'object') return {}
  const src = raw as Record<string, unknown>
  const out: Partial<FeatureFlags> = {}
  for (const k of FEATURE_KEYS) {
    if (typeof src[k] === 'boolean') out[k] = src[k] as boolean
  }
  return out
}

/**
 * Resolve effective flags: defaults ← global overrides ← tenant overrides.
 * Later layers win; unknown keys are ignored so a bad record can't break resolution.
 */
export function resolveFeatures(globalOverrides?: unknown, tenantOverrides?: unknown): FeatureFlags {
  return { ...DEFAULT_FEATURES, ...pickBooleans(globalOverrides), ...pickBooleans(tenantOverrides) }
}

export function isFeatureEnabled(features: FeatureFlags, key: FeatureKey): boolean {
  return features[key] === true
}
