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

/**
 * Default = what a tenant gets with nothing configured.
 *
 * These MUST reflect what is actually built and running, because the flags are
 * now enforced (see require-feature.ts). A module that ships and works but
 * defaults to false would be switched off for everyone the moment enforcement
 * lands — the flag defaults stop being cosmetic once something reads them.
 *
 * So: on for modules that exist and work today; off only for the two that are
 * genuinely not built (a public API for api_access to guard, and SSO).
 */
export const DEFAULT_FEATURES: FeatureFlags = {
  trade_in: true,
  cpo: true,
  rve: true,
  billing: true,
  reporting: true,
  notifications: true,
  knowledge_base: true,  // kb_articles + /api/kb are live
  chat: true,            // the AI assistant is live
  impersonation: true,   // admin impersonation is live and audited
  api_access: false,     // no public API exists for a key to unlock yet
  sso: false,            // not built
  // Off deliberately: this flag means the PER-VAR vendor auction, which the
  // client deferred ("not initially"). Byte-Back's own single-tenant vendor
  // bidding is a different, already-live thing and is not gated by this.
  vendor_auction: false,
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

/**
 * Modules a VAR may switch off for its own organization.
 *
 * Not every flag makes sense as a VAR self-serve toggle, and offering one that
 * can't be honored is how this surface ended up lying: the Features page
 * rendered a live switch for all 12, so a VAR could "disable Billing" (i.e.
 * opt out of being invoiced by Byte-Back) or "disable Notifications" (silently
 * suppressing transactional order mail) and the switch would save, toast
 * success, and change nothing.
 *
 * Excluded on purpose:
 *   billing        — this is Byte-Back invoicing the VAR; not the VAR's call.
 *   notifications  — suppressing transactional order mail/SMS is a support
 *                    and compliance decision, not a self-serve switch.
 *   impersonation  — a support capability keyed to the TARGET user's tenant,
 *                    not the actor's, so a toggle here wouldn't gate it.
 *   sso / vendor_auction — nothing built to gate yet.
 *
 * The platform ceiling (settings.features) still controls all 12 — this only
 * governs which ones a VAR may narrow for itself.
 */
export const VAR_TOGGLEABLE_FEATURES: FeatureKey[] = [
  'trade_in', 'cpo', 'rve', 'reporting', 'api_access', 'knowledge_base', 'chat',
]

export function isVarToggleable(key: FeatureKey): boolean {
  return VAR_TOGGLEABLE_FEATURES.includes(key)
}

/**
 * Apply a VAR's own on/off toggles on top of its platform ceiling:
 * effective = ceiling AND var toggle, with unset keys inheriting the ceiling.
 * A stored `true` under a false ceiling still resolves off — the VAR side can
 * narrow its plan's modules but never widen them.
 */
export function applyVarToggles(ceiling: FeatureFlags, varOverrides?: unknown): FeatureFlags {
  const t = pickBooleans(varOverrides)
  const out = { ...DEFAULT_FEATURES }
  for (const k of FEATURE_KEYS) out[k] = ceiling[k] && (t[k] ?? true)
  return out
}
