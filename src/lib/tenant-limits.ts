// ============================================================================
// TENANT LIMITS — resolve a tenant's license + feature flags from settings
// ============================================================================
// Pure helper so create paths and module routes gate consistently without
// repeating the resolve boilerplate. The caller loads the tenant's settings
// JSONB with its own client (keeping the generic Supabase client out of this
// helper avoids tsc's "excessively deep" instantiation). Unset settings resolve
// to unlimited limits + core-modules-on, so gating is a no-op for the platform
// tenant and only bites once a VAR is assigned a finite plan.

import { resolveLicense, type LicenseLimits } from './licensing'
import { resolveFeatures, type FeatureFlags } from './features'

export interface TenantLimits {
  license: LicenseLimits
  features: FeatureFlags
}

export function tenantLimits(settings: unknown): TenantLimits {
  const s = (settings && typeof settings === 'object' ? settings : {}) as {
    license?: unknown
    features?: unknown
  }
  return {
    license: resolveLicense(s.license),
    features: resolveFeatures(undefined, s.features),
  }
}
