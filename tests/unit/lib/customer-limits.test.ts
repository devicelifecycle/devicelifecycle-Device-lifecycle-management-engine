import { describe, it, expect } from 'vitest'
import { resolveCustomerLimits } from '@/lib/customer-limits'
import { DEFAULT_LICENSE, UNLIMITED, type LicenseLimits } from '@/lib/licensing'

const tenantLicense: LicenseLimits = {
  customers: 1000,
  users: 50,
  storageMb: 10240,
  apiCallsPerMonth: 100000,
  transactionsPerMonth: 50000,
}

describe('resolveCustomerLimits', () => {
  it('applies the customer plan override over the tenant license when plan_id is set', () => {
    const result = resolveCustomerLimits(tenantLicense, {
      limits: { customers: 25, storageMb: 512 },
    })
    expect(result).toEqual({
      customers: 25,
      // fields absent from the plan blob fall back to unlimited per licensing.ts
      users: UNLIMITED,
      storageMb: 512,
      apiCallsPerMonth: UNLIMITED,
      transactionsPerMonth: UNLIMITED,
    })
  })

  it('inherits the tenant license unchanged when the customer has no plan (null)', () => {
    const result = resolveCustomerLimits(tenantLicense, null)
    expect(result).toBe(tenantLicense)
  })

  it('maps an empty plan limits blob to all-unlimited like tenant-side resolution', () => {
    // subscription_plans.limits defaults to '{}': an empty blob resolves to
    // DEFAULT_LICENSE, matching how tenantLimits() handles unset settings.
    const result = resolveCustomerLimits(tenantLicense, {})
    expect(result).toEqual(DEFAULT_LICENSE)
  })

  it('fills only fields present in a partial plan blob, per licensing.ts semantics', () => {
    const result = resolveCustomerLimits(tenantLicense, { limits: { users: 5 } })
    expect(result.users).toBe(5)
    expect(result.customers).toBe(UNLIMITED)
    expect(result.storageMb).toBe(UNLIMITED)
    expect(result.apiCallsPerMonth).toBe(UNLIMITED)
    expect(result.transactionsPerMonth).toBe(UNLIMITED)
  })

  it('passes unlimited sentinels through untouched (negatives normalize to -1)', () => {
    const result = resolveCustomerLimits(tenantLicense, {
      limits: { customers: -1, storageMb: -3.7 },
    })
    expect(result.customers).toBe(UNLIMITED)
    expect(result.storageMb).toBe(UNLIMITED)
  })

  it('ignores non-finite or wrong-typed values like resolveLicense does', () => {
    const result = resolveCustomerLimits(tenantLicense, {
      limits: { users: 'lots', apiCallsPerMonth: null },
    })
    expect(result.users).toBe(UNLIMITED)
    expect(result.apiCallsPerMonth).toBe(UNLIMITED)
  })
})