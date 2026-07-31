import { describe, it, expect } from 'vitest'
import {
  resolveLicense,
  quotaStatus,
  canAllocate,
  DEFAULT_LICENSE,
  UNLIMITED,
} from '@/lib/licensing'

describe('license resolution', () => {
  it('defaults to unlimited on every metric', () => {
    expect(resolveLicense(null)).toEqual(DEFAULT_LICENSE)
    for (const v of Object.values(resolveLicense({}))) expect(v).toBe(UNLIMITED)
  })

  it('applies finite caps and floors negatives to unlimited', () => {
    const lic = resolveLicense({ customers: 100, users: 25, storageMb: -3, bogus: 5 })
    expect(lic.customers).toBe(100)
    expect(lic.users).toBe(25)
    expect(lic.storageMb).toBe(UNLIMITED)
    expect(lic.apiCallsPerMonth).toBe(UNLIMITED)
  })

  it('floors fractional caps', () => {
    expect(resolveLicense({ customers: 10.9 }).customers).toBe(10)
  })
})

describe('quota status', () => {
  it('reports remaining and ratio for a finite limit', () => {
    const s = quotaStatus(100, 40)
    expect(s.remaining).toBe(60)
    expect(s.unlimited).toBe(false)
    expect(s.exceeded).toBe(false)
    expect(s.ratio).toBeCloseTo(0.4, 5)
  })

  it('flags exceeded when usage passes the limit', () => {
    const s = quotaStatus(100, 130)
    expect(s.exceeded).toBe(true)
    expect(s.remaining).toBe(0)
    expect(s.ratio).toBe(1)
  })

  it('treats a negative limit as unlimited', () => {
    const s = quotaStatus(UNLIMITED, 9_999_999)
    expect(s.unlimited).toBe(true)
    expect(s.remaining).toBe(Infinity)
    expect(s.exceeded).toBe(false)
    expect(s.ratio).toBe(0)
  })
})

describe('allocation guard', () => {
  it('allows within the cap and blocks at/over it', () => {
    expect(canAllocate(100, 99, 1)).toBe(true)
    expect(canAllocate(100, 100, 1)).toBe(false)
    expect(canAllocate(100, 95, 10)).toBe(false)
  })

  it('always allows when unlimited', () => {
    expect(canAllocate(UNLIMITED, 1_000_000, 500)).toBe(true)
  })
})
