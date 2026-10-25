import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { PLAN_TIERS, tierToPlanRow } from '@/lib/plan-tiers'

/**
 * The tier model lives in TWO places: src/lib/plan-tiers.ts (what the product
 * reads) and the seed migration (what the database holds). If they drift, the
 * pricing page advertises one thing and the runtime enforces another — and
 * nothing would fail until a customer hit the difference.
 *
 * This parses the migration and compares it to the code model.
 */

const MIGRATION = path.resolve(
  __dirname, '../../../supabase/migrations/20261023000000_two_tier_per_seat_plans.sql',
)

function seededTiers(sql: string) {
  // The migration uses multi-line VALUES blocks. Match each VALUES ( ... ) block.
  const valuesRe = /VALUES\s*\(\s*'([^']+)',\s*'([a-z_]+)',\s*(\d+),\s*'([A-Z]{3})',\s*'(\{[^']*\})'::jsonb,\s*'(\{[^']*\})'::jsonb,\s*(true|false)\s*\)/gi
  const out: Record<string, {
    name: string; price: number; currency: string
    features: Record<string, boolean>; limits: Record<string, number>; isActive: boolean
  }> = {}
  let m
  while ((m = valuesRe.exec(sql))) {
    out[m[2]] = {
      name: m[1],
      price: Number(m[3]),
      currency: m[4],
      limits: JSON.parse(m[5]),
      features: JSON.parse(m[6]),
      isActive: m[7].toLowerCase() === 'true',
    }
  }
  return out
}

describe('plan tiers: code model ↔ seed migration parity', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8')
  const seeded = seededTiers(sql)

  it('the parser actually found both tiers (a silent 0 would pass everything)', () => {
    expect(Object.keys(seeded).sort()).toEqual(['enterprise', 'individual'])
  })

  for (const tier of PLAN_TIERS) {
    describe(tier.slug, () => {
      it('is seeded', () => {
        expect(seeded[tier.slug], `${tier.slug} missing from the migration`).toBeDefined()
      })

      it('matches the code model price', () => {
        const row = tierToPlanRow(tier)
        const db = seeded[tier.slug]
        expect(db.name).toBe(row.name)
        expect(db.price).toBe(row.price_per_seat)
        expect(db.currency).toBe(row.currency)
        expect(db.isActive).toBe(row.is_active)
      })

      it('seeds the same features the tier sells', () => {
        const row = tierToPlanRow(tier)
        expect(seeded[tier.slug].features).toEqual(row.features)
      })

      it('seeds no feature the tier does not sell', () => {
        for (const key of Object.keys(seeded[tier.slug].features)) {
          expect(tier.features, `${tier.slug} seeds ${key} which is not in the tier`).toContain(key)
        }
      })
    })
  }

  it('retires old essentials/professional plans', () => {
    expect(sql).toMatch(/UPDATE subscription_plans SET is_active = false/)
    expect(sql).toMatch(/'essentials'/)
    expect(sql).toMatch(/'professional'/)
  })

  it('migrates existing tenants from old plans to individual', () => {
    expect(sql).toMatch(/UPDATE tenants SET plan = 'individual'/)
  })
})
