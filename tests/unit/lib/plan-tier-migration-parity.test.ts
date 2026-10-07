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
 * This parses the migration and compares it to the code model. It is the same
 * class of check as the tenant-branding schema parity test, which was added
 * after that exact defect occurred four times.
 */

const MIGRATION = path.resolve(
  __dirname, '../../../supabase/migrations/20261007000000_subscription_tiers.sql',
)

function seededTiers(sql: string) {
  // Each VALUES row: ( 'slug', 'Name', PRICE, 'CAD', '{features}'::jsonb, '{limits}'::jsonb, true )
  const rowRe = /\(\s*'([a-z_]+)',\s*'([^']+)',\s*(NULL|[\d.]+),\s*'([A-Z]{3})',\s*'(\{[^']*\})'::jsonb,\s*'(\{[^']*\})'::jsonb,\s*(true|false)\s*\)/gi
  const out: Record<string, {
    name: string; price: number | null; currency: string
    features: Record<string, boolean>; limits: Record<string, number>; isActive: boolean
  }> = {}
  let m
  while ((m = rowRe.exec(sql))) {
    out[m[1]] = {
      name: m[2],
      price: /^null$/i.test(m[3]) ? null : Number(m[3]),
      currency: m[4],
      features: JSON.parse(m[5]),
      limits: JSON.parse(m[6]),
      isActive: m[7].toLowerCase() === 'true',
    }
  }
  return out
}

describe('plan tiers: code model ↔ seed migration parity', () => {
  const sql = fs.readFileSync(MIGRATION, 'utf8')
  const seeded = seededTiers(sql)

  it('the parser actually found all three tiers (a silent 0 would pass everything)', () => {
    expect(Object.keys(seeded).sort()).toEqual(['enterprise', 'essentials', 'professional'])
  })

  for (const tier of PLAN_TIERS) {
    describe(tier.slug, () => {
      it('is seeded', () => {
        expect(seeded[tier.slug], `${tier.slug} missing from the migration`).toBeDefined()
      })

      it('matches the code model exactly', () => {
        const row = tierToPlanRow(tier)
        const db = seeded[tier.slug]
        expect(db.name).toBe(row.name)
        expect(db.price).toBe(row.monthly_price)
        expect(db.currency).toBe(row.currency)
        expect(db.isActive).toBe(row.is_active)
        expect(db.limits).toEqual(row.limits)
        // Feature maps: the migration lists only the enabled ones, same as
        // tierToPlanRow, so these compare whole.
        expect(db.features).toEqual(row.features)
      })

      it('seeds no feature the tier does not sell', () => {
        for (const key of Object.keys(seeded[tier.slug].features)) {
          expect(tier.features, `${tier.slug} seeds ${key} which is not in the tier`).toContain(key)
        }
      })
    })
  }

  it('seeds no price — pricing is pending client approval', () => {
    for (const [slug, row] of Object.entries(seeded)) {
      expect(row.price, `${slug} must be NULL until approved`).toBeNull()
    }
  })

  it('removes the old placeholder slugs rather than leaving them active', () => {
    expect(sql).toMatch(/DELETE FROM subscription_plans WHERE slug IN \('starter', 'growth'\)/)
  })

  it('refuses to re-slug if any tenant is assigned to an old plan', () => {
    // Without this guard the migration would orphan tenants.plan, which joins
    // on slug, and the tenant would silently lose its entitlements.
    expect(sql).toMatch(/RAISE EXCEPTION/)
    expect(sql).toMatch(/FROM tenants\s+WHERE plan IS NOT NULL/)
  })
})
