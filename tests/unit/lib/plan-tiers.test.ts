import { describe, it, expect } from 'vitest'
import {
  PLAN_TIERS, TIER_SLUGS, tierBySlug, incrementalFeatures, tierIncludes,
  lowestTierWith, tierToPlanRow, isPriced, nextTierAbove,
} from '@/lib/plan-tiers'
import { featureBlockMessage, quotaBlockMessage } from '@/lib/quota'
import { FEATURE_KEYS, DEFAULT_FEATURES, type FeatureKey } from '@/lib/features'
import { LIMIT_KEYS, UNLIMITED } from '@/lib/licensing'

describe('the tier ladder', () => {
  it('has exactly the two tiers, in ascending order', () => {
    expect(PLAN_TIERS.map((t) => t.slug)).toEqual([...TIER_SLUGS])
    expect(TIER_SLUGS).toEqual(['individual', 'enterprise'])
  })

  it('is strictly additive — no tier ever loses a feature from the one below', () => {
    for (let i = 1; i < PLAN_TIERS.length; i++) {
      const below = PLAN_TIERS[i - 1]
      const above = PLAN_TIERS[i]
      for (const f of below.features) {
        expect(above.features, `${above.slug} must keep ${f} from ${below.slug}`).toContain(f)
      }
    }
  })

  it('never reduces capacity as you move up', () => {
    for (let i = 1; i < PLAN_TIERS.length; i++) {
      const below = PLAN_TIERS[i - 1]
      const above = PLAN_TIERS[i]
      for (const k of LIMIT_KEYS) {
        const lo = below.limits[k]
        const hi = above.limits[k]
        if (hi === UNLIMITED) continue           // unlimited always wins
        if (lo === UNLIMITED) {
          throw new Error(`${above.slug}.${k} is finite but ${below.slug}.${k} is unlimited`)
        }
        expect(hi, `${above.slug}.${k} must be >= ${below.slug}.${k}`).toBeGreaterThanOrEqual(lo)
      }
    }
  })

  it('only references real feature keys', () => {
    for (const t of PLAN_TIERS) {
      for (const f of t.features) {
        expect(FEATURE_KEYS, `${t.slug} references unknown feature ${f}`).toContain(f)
      }
    }
  })

  it('declares every limit key — a missing one would resolve to a default nobody chose', () => {
    for (const t of PLAN_TIERS) {
      for (const k of LIMIT_KEYS) {
        expect(t.limits[k], `${t.slug} is missing limit ${k}`).toBeTypeOf('number')
      }
    }
  })

  it('prices are set (per-seat, non-zero)', () => {
    for (const t of PLAN_TIERS) {
      expect(t.pricePerSeat, `${t.slug} should have a per-seat price`).toBeGreaterThan(0)
      expect(isPriced(t)).toBe(true)
    }
    expect(tierBySlug('individual')!.pricePerSeat).toBe(40)
    expect(tierBySlug('enterprise')!.pricePerSeat).toBe(70)
  })

  it('gives every tier the copy the pricing page needs', () => {
    for (const t of PLAN_TIERS) {
      expect(t.name.length).toBeGreaterThan(0)
      expect(t.tagline.length).toBeGreaterThan(0)
      expect(t.bestFor.length).toBeGreaterThan(0)
      expect(t.highlights.length).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('roadmap vs features — never sell what is not built', () => {
  it('keeps unbuilt capabilities OUT of the enforced feature list', () => {
    for (const t of PLAN_TIERS) {
      expect(t.features).not.toContain('sso')
    }
    const ent = tierBySlug('enterprise')!
    expect(ent.roadmap?.some((r) => /single sign-on/i.test(r.label))).toBe(true)
  })

  it('a roadmap item never appears in highlights as if it ships today', () => {
    for (const t of PLAN_TIERS) {
      for (const r of t.roadmap ?? []) {
        const key = r.label.split('(')[0].trim().toLowerCase()
        expect(
          t.highlights.some((h) => h.toLowerCase().includes(key)),
          `${t.slug} highlights must not advertise the unbuilt "${r.label}"`,
        ).toBe(false)
      }
    }
  })
})

describe('incrementalFeatures', () => {
  it('is what the tier adds, not everything it has', () => {
    expect(incrementalFeatures('individual')).toEqual(tierBySlug('individual')!.features)
    const ent = incrementalFeatures('enterprise')
    expect(ent).toEqual(expect.arrayContaining(['api_access', 'white_label']))
    expect(ent).not.toContain('billing')
  })
})

describe('entitlement helpers', () => {
  it('tierIncludes answers what the runtime gate asks', () => {
    expect(tierIncludes('individual', 'trade_in')).toBe(true)
    expect(tierIncludes('individual', 'api_access')).toBe(false)
    expect(tierIncludes('enterprise', 'api_access')).toBe(true)
    expect(tierIncludes('enterprise', 'white_label')).toBe(true)
    expect(tierIncludes('nonsense', 'trade_in')).toBe(false)
  })

  it('lowestTierWith names the cheapest tier that unlocks a feature', () => {
    expect(lowestTierWith('trade_in')?.slug).toBe('individual')
    expect(lowestTierWith('api_access')?.slug).toBe('enterprise')
    expect(lowestTierWith('white_label')?.slug).toBe('enterprise')
  })

  it('returns undefined for a feature no tier sells, rather than guessing', () => {
    expect(lowestTierWith('vendor_auction' as FeatureKey)).toBeUndefined()
  })
})

describe('tierToPlanRow', () => {
  it('produces the subscription_plans shape, with features as a boolean map', () => {
    const row = tierToPlanRow(tierBySlug('individual')!)
    expect(row.slug).toBe('individual')
    expect(row.price_per_seat).toBe(40)
    expect(row.currency).toBe('CAD')
    expect(row.is_active).toBe(true)
    expect(row.features).toMatchObject({ trade_in: true, cpo: true })
    expect(row.features).not.toHaveProperty('api_access')
    expect(row.limits.customers).toBe(500)
  })
})

describe('upgrade messaging — the runtime connection', () => {
  it('nextTierAbove walks the ladder and stops at the top', () => {
    expect(nextTierAbove('individual')?.slug).toBe('enterprise')
    expect(nextTierAbove('enterprise')).toBeUndefined()
    expect(nextTierAbove('nonsense')).toBeUndefined()
  })

  it('a blocked feature names the tier that unlocks it', () => {
    const features = { ...DEFAULT_FEATURES, api_access: false }
    const msg = featureBlockMessage(features, 'api_access', 'API Access')
    expect(msg).toMatch(/not included in your plan/i)
    expect(msg).toMatch(/Enterprise/)
  })

  it('falls back to generic wording for a feature no tier sells', () => {
    const features = { ...DEFAULT_FEATURES, vendor_auction: false }
    const msg = featureBlockMessage(features, 'vendor_auction', 'Vendor auction')
    expect(msg).toMatch(/not enabled on this plan/i)
    expect(msg).not.toMatch(/available on/i)
  })

  it('a hit limit names the tier that raises it, and says nothing misleading at the top', () => {
    const mid = quotaBlockMessage(50, 50, 1, 'Customers', 'individual')
    expect(mid).toMatch(/Enterprise raises this limit/)
    const top = quotaBlockMessage(50, 50, 1, 'Customers', 'enterprise')
    expect(top).toMatch(/Upgrade the plan/)
    expect(top).not.toMatch(/raises this limit/)
  })

  it('still works when the tier is unknown (platform tenant has no plan)', () => {
    expect(quotaBlockMessage(5, 5, 1, 'Users', null)).toMatch(/Upgrade the plan/)
  })
})
