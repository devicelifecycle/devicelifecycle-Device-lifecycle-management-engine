import { describe, it, expect } from 'vitest'
import { buildUsageReport, overLimitMetrics } from '@/lib/usage'
import { resolveLicense, UNLIMITED } from '@/lib/licensing'

describe('tenant usage report', () => {
  it('reports used/remaining against finite limits', () => {
    const license = resolveLicense({ customers: 100, users: 10 })
    const report = buildUsageReport({ customers: 40, users: 10 }, license)
    expect(report.customers.remaining).toBe(60)
    expect(report.customers.exceeded).toBe(false)
    expect(report.users.remaining).toBe(0)
    expect(report.users.exceeded).toBe(false)
  })

  it('unlimited metrics never exceed', () => {
    const report = buildUsageReport({ storageMb: 9_999_999 }, resolveLicense({}))
    expect(report.storageMb.unlimited).toBe(true)
    expect(report.storageMb.exceeded).toBe(false)
    expect(report.storageMb.limit).toBe(UNLIMITED)
  })

  it('flags metrics over their limit', () => {
    const license = resolveLicense({ customers: 100, users: 5 })
    const report = buildUsageReport({ customers: 130, users: 3 }, license)
    expect(report.customers.exceeded).toBe(true)
    expect(overLimitMetrics(report)).toEqual(['customers'])
  })

  it('missing counts are treated as zero', () => {
    const report = buildUsageReport({}, resolveLicense({ customers: 50 }))
    expect(report.customers.used).toBe(0)
    expect(report.customers.remaining).toBe(50)
  })
})
