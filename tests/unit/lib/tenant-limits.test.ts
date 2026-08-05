import { describe, it, expect } from 'vitest'
import { tenantLimits } from '@/lib/tenant-limits'
import { DEFAULT_LICENSE, UNLIMITED } from '@/lib/licensing'
import { DEFAULT_FEATURES } from '@/lib/features'

describe('tenantLimits', () => {
  it('unset / null / non-object settings → unlimited limits + default features (platform no-op)', () => {
    for (const raw of [null, undefined, {}, 'x', 42]) {
      const { license, features } = tenantLimits(raw)
      expect(license).toEqual(DEFAULT_LICENSE)
      expect(features).toEqual(DEFAULT_FEATURES)
    }
  })

  it('reads a finite plan license and per-tenant feature overrides', () => {
    const { license, features } = tenantLimits({
      license: { users: 5, transactionsPerMonth: 100 },
      features: { cpo: false, api_access: true },
    })
    expect(license.users).toBe(5)
    expect(license.transactionsPerMonth).toBe(100)
    expect(license.customers).toBe(UNLIMITED) // unset key stays unlimited
    expect(features.cpo).toBe(false) // disabled for this tenant
    expect(features.trade_in).toBe(true) // untouched default
    expect(features.api_access).toBe(true) // enabled override
  })

  it('ignores garbage keys and keeps resolution safe', () => {
    const { license, features } = tenantLimits({ license: { users: 'lots' }, features: { cpo: 'yes' } })
    expect(license.users).toBe(UNLIMITED) // non-number ignored
    expect(features.cpo).toBe(true) // non-boolean ignored → default
  })
})
