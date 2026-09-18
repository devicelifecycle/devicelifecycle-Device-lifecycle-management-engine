import { describe, it, expect } from 'vitest'
import {
  resolveFeatures,
  isFeatureEnabled,
  DEFAULT_FEATURES,
  FEATURE_KEYS,
  isVarToggleable,
  VAR_TOGGLEABLE_FEATURES,
} from '@/lib/features'

describe('feature flags', () => {
  it('empty resolves to defaults', () => {
    expect(resolveFeatures()).toEqual(DEFAULT_FEATURES)
    expect(resolveFeatures(null, undefined)).toEqual(DEFAULT_FEATURES)
  })

  it('core modules on, optional modules off by default', () => {
    expect(DEFAULT_FEATURES.trade_in).toBe(true)
    expect(DEFAULT_FEATURES.billing).toBe(true)
    expect(DEFAULT_FEATURES.sso).toBe(false)
    expect(DEFAULT_FEATURES.vendor_auction).toBe(false)
  })

  // These flags are ENFORCED now (src/lib/supabase/require-feature.ts), so a
  // default of false would switch a live, shipped module off for every tenant
  // that has no explicit override. Guarding the defaults keeps that from
  // regressing silently.
  it('defaults to ON for modules that are actually built and running', () => {
    expect(DEFAULT_FEATURES.knowledge_base).toBe(true)
    expect(DEFAULT_FEATURES.chat).toBe(true)
    expect(DEFAULT_FEATURES.impersonation).toBe(true)
    expect(DEFAULT_FEATURES.rve).toBe(true)
    expect(DEFAULT_FEATURES.reporting).toBe(true)
  })

  it('defaults to OFF only where nothing is built to enable', () => {
    expect(DEFAULT_FEATURES.api_access).toBe(false) // no public API to unlock
    expect(DEFAULT_FEATURES.sso).toBe(false)
  })
})

// A VAR-facing switch that saves and changes nothing is the exact defect this
// codebase keeps producing. A module may only be offered as a VAR self-serve
// toggle if some route actually gates on it.
describe('VAR-toggleable modules are limited to ones enforcement honors', () => {
  it('excludes modules that are not the VAR\'s to control', () => {
    for (const key of ['billing', 'notifications', 'impersonation', 'sso', 'vendor_auction'] as const) {
      expect(isVarToggleable(key), `${key} must not be VAR-toggleable`).toBe(false)
    }
  })

  it('includes the modules that do have a real enforcement point', () => {
    // trade_in/cpo -> /api/orders, rve -> /api/rve/*, knowledge_base -> /api/kb,
    // api_access -> /api/var/api-keys, reporting -> /api/var/reports,
    // chat -> /api/chat.
    for (const key of ['trade_in', 'cpo', 'rve', 'reporting', 'api_access', 'knowledge_base', 'chat'] as const) {
      expect(isVarToggleable(key), `${key} should be VAR-toggleable`).toBe(true)
    }
  })

  it('every VAR-toggleable module is a real feature key', () => {
    for (const key of VAR_TOGGLEABLE_FEATURES) {
      expect(FEATURE_KEYS).toContain(key)
    }
  })

  it('tenant override wins over global override wins over default', () => {
    const f = resolveFeatures({ sso: true, chat: true }, { chat: false })
    expect(f.sso).toBe(true)   // from global
    expect(f.chat).toBe(false) // tenant overrides global
    expect(f.trade_in).toBe(true) // default untouched
  })

  it('ignores unknown keys and non-boolean values', () => {
    const f = resolveFeatures({ bogus: true, sso: 'yes' as unknown })
    expect(f.sso).toBe(false) // non-boolean ignored → default
    expect((f as Record<string, unknown>).bogus).toBeUndefined()
  })

  it('a global kill-switch disables a core module for everyone', () => {
    const f = resolveFeatures({ billing: false })
    expect(isFeatureEnabled(f, 'billing')).toBe(false)
  })

  it('resolved flags always cover every known key', () => {
    const f = resolveFeatures({ sso: true })
    for (const k of FEATURE_KEYS) expect(typeof f[k]).toBe('boolean')
  })
})
