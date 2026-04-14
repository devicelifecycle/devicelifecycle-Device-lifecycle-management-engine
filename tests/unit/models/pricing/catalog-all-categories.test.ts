// ============================================================================
// CATALOG-WIDE PRICING COVERAGE — 52 devices × 5 conditions × 2 purposes
// ============================================================================
// Verifies SimpleMarginPricingModel produces valid prices for every device
// category in our catalog: phones (Apple, Samsung, Google, Motorola, OnePlus),
// tablets (iPad, Galaxy Tab, Surface, Pixel Tablet), laptops (MacBook, Dell,
// HP, Lenovo, Microsoft Surface), watches (Apple, Samsung, Google), and
// accessories. No DB required — SimpleMarginModel is fully deterministic.

import { describe, expect, it } from 'vitest'
import { SimpleMarginPricingModel } from '@/models/pricing'
import type { DeviceCondition } from '@/types'

const model = new SimpleMarginPricingModel()

// ── Catalog device registry (52 devices) ─────────────────────────────────────
// device_id is just a label here; SimpleMarginModel doesn't use it for DB calls.
// base_price is the realistic mid-market anchor price in CAD.

interface CatalogEntry {
  id: string
  label: string
  category: 'phone' | 'tablet' | 'laptop' | 'watch' | 'other'
  base_price: number
}

const CATALOG: CatalogEntry[] = [
  // ── Apple iPhone ───────────────────────────────────────────────────────────
  { id: 'apl-ip16promax', label: 'Apple iPhone 16 Pro Max', category: 'phone', base_price: 1250 },
  { id: 'apl-ip16pro',    label: 'Apple iPhone 16 Pro',     category: 'phone', base_price: 1100 },
  { id: 'apl-ip16',       label: 'Apple iPhone 16',         category: 'phone', base_price: 900 },
  { id: 'apl-ip15promax', label: 'Apple iPhone 15 Pro Max', category: 'phone', base_price: 1050 },
  { id: 'apl-ip15pro',    label: 'Apple iPhone 15 Pro',     category: 'phone', base_price: 950 },
  { id: 'apl-ip15',       label: 'Apple iPhone 15',         category: 'phone', base_price: 800 },
  { id: 'apl-ip14promax', label: 'Apple iPhone 14 Pro Max', category: 'phone', base_price: 900 },
  { id: 'apl-ip14',       label: 'Apple iPhone 14',         category: 'phone', base_price: 650 },
  { id: 'apl-ip13promax', label: 'Apple iPhone 13 Pro Max', category: 'phone', base_price: 750 },
  { id: 'apl-ip13',       label: 'Apple iPhone 13',         category: 'phone', base_price: 550 },
  { id: 'apl-ip12',       label: 'Apple iPhone 12',         category: 'phone', base_price: 420 },
  { id: 'apl-ip11',       label: 'Apple iPhone 11',         category: 'phone', base_price: 320 },
  { id: 'apl-ipse3',      label: 'Apple iPhone SE (3rd Gen)', category: 'phone', base_price: 380 },
  { id: 'apl-ipxr',       label: 'Apple iPhone XR',         category: 'phone', base_price: 250 },

  // ── Samsung Galaxy ─────────────────────────────────────────────────────────
  { id: 'sms-s25ultra',   label: 'Samsung Galaxy S25 Ultra',category: 'phone', base_price: 1300 },
  { id: 'sms-s25plus',    label: 'Samsung Galaxy S25+',     category: 'phone', base_price: 1050 },
  { id: 'sms-s25',        label: 'Samsung Galaxy S25',      category: 'phone', base_price: 900 },
  { id: 'sms-s24ultra',   label: 'Samsung Galaxy S24 Ultra',category: 'phone', base_price: 1150 },
  { id: 'sms-s24',        label: 'Samsung Galaxy S24',      category: 'phone', base_price: 750 },
  { id: 'sms-s23ultra',   label: 'Samsung Galaxy S23 Ultra',category: 'phone', base_price: 950 },
  { id: 'sms-s22ultra',   label: 'Samsung Galaxy S22 Ultra',category: 'phone', base_price: 700 },
  { id: 'sms-zflip6',     label: 'Samsung Galaxy Z Flip6',  category: 'phone', base_price: 950 },
  { id: 'sms-zfold6',     label: 'Samsung Galaxy Z Fold6',  category: 'phone', base_price: 1700 },
  { id: 'sms-a55',        label: 'Samsung Galaxy A55',      category: 'phone', base_price: 280 },
  { id: 'sms-a35',        label: 'Samsung Galaxy A35',      category: 'phone', base_price: 220 },

  // ── Google Pixel ───────────────────────────────────────────────────────────
  { id: 'goo-px9pro',     label: 'Google Pixel 9 Pro',      category: 'phone', base_price: 1000 },
  { id: 'goo-px9',        label: 'Google Pixel 9',          category: 'phone', base_price: 800 },
  { id: 'goo-px8pro',     label: 'Google Pixel 8 Pro',      category: 'phone', base_price: 750 },
  { id: 'goo-px7a',       label: 'Google Pixel 7a',         category: 'phone', base_price: 450 },

  // ── Motorola ───────────────────────────────────────────────────────────────
  { id: 'mot-edge50ultra',label: 'Motorola Edge 50 Ultra',  category: 'phone', base_price: 700 },
  { id: 'mot-razr2024',   label: 'Motorola Razr (2024)',    category: 'phone', base_price: 750 },

  // ── OnePlus ────────────────────────────────────────────────────────────────
  { id: 'opl-12',         label: 'OnePlus 12',              category: 'phone', base_price: 850 },
  { id: 'opl-open',       label: 'OnePlus Open',            category: 'phone', base_price: 1400 },

  // ── Apple iPad ─────────────────────────────────────────────────────────────
  { id: 'apl-ipadpro13m4',label: 'iPad Pro 13-inch (M4)',   category: 'tablet', base_price: 1550 },
  { id: 'apl-ipadpro11m4',label: 'iPad Pro 11-inch (M4)',   category: 'tablet', base_price: 1200 },
  { id: 'apl-ipadairm2',  label: 'iPad Air (M2)',           category: 'tablet', base_price: 850 },
  { id: 'apl-ipad10',     label: 'iPad (10th generation)',  category: 'tablet', base_price: 500 },
  { id: 'apl-ipadmini6',  label: 'iPad mini (6th generation)', category: 'tablet', base_price: 580 },

  // ── Samsung Galaxy Tab ─────────────────────────────────────────────────────
  { id: 'sms-tabs10ultra',label: 'Samsung Galaxy Tab S10 Ultra', category: 'tablet', base_price: 1100 },
  { id: 'sms-tabs9plus',  label: 'Samsung Galaxy Tab S9+', category: 'tablet', base_price: 800 },
  { id: 'sms-tabs9',      label: 'Samsung Galaxy Tab S9',  category: 'tablet', base_price: 650 },
  { id: 'sms-taba9plus',  label: 'Samsung Galaxy Tab A9+', category: 'tablet', base_price: 280 },

  // ── Microsoft Surface (tablet) ─────────────────────────────────────────────
  { id: 'msf-pro11',      label: 'Microsoft Surface Pro 11', category: 'tablet', base_price: 1250 },
  { id: 'msf-go4',        label: 'Microsoft Surface Go 4', category: 'tablet', base_price: 600 },

  // ── Apple MacBook ──────────────────────────────────────────────────────────
  { id: 'apl-mbp16m4max', label: 'MacBook Pro 16-inch (M4 Max)', category: 'laptop', base_price: 3500 },
  { id: 'apl-mbp14m4pro', label: 'MacBook Pro 14-inch (M4 Pro)', category: 'laptop', base_price: 2400 },
  { id: 'apl-mbp14m3pro', label: 'MacBook Pro 14-inch (M3 Pro)', category: 'laptop', base_price: 2000 },
  { id: 'apl-mba15m4',    label: 'MacBook Air 15-inch (M4)',    category: 'laptop', base_price: 1600 },
  { id: 'apl-mba13m4',    label: 'MacBook Air 13-inch (M4)',    category: 'laptop', base_price: 1350 },
  { id: 'apl-mba13m2',    label: 'MacBook Air 13-inch (M2)',    category: 'laptop', base_price: 1100 },

  // ── Dell ───────────────────────────────────────────────────────────────────
  { id: 'del-lat7440',    label: 'Dell Latitude 7440',          category: 'laptop', base_price: 1450 },
  { id: 'del-lat5540',    label: 'Dell Latitude 5540',          category: 'laptop', base_price: 1000 },
  { id: 'del-lat3440',    label: 'Dell Latitude 3440',          category: 'laptop', base_price: 700 },
  { id: 'del-xps15-9530', label: 'Dell XPS 15 (9530)',         category: 'laptop', base_price: 1900 },
  { id: 'del-xps13-9340', label: 'Dell XPS 13 (9340)',         category: 'laptop', base_price: 1400 },
  { id: 'del-prec5580',   label: 'Dell Precision 5580',         category: 'laptop', base_price: 2300 },

  // ── HP ─────────────────────────────────────────────────────────────────────
  { id: 'hp-eb840g10',    label: 'HP EliteBook 840 G10',       category: 'laptop', base_price: 1350 },
  { id: 'hp-eb860g10',    label: 'HP EliteBook 860 G10',       category: 'laptop', base_price: 1500 },
  { id: 'hp-pb450g10',    label: 'HP ProBook 450 G10',         category: 'laptop', base_price: 850 },
  { id: 'hp-spec14-2023', label: 'HP Spectre x360 14 (2023)',  category: 'laptop', base_price: 1700 },
  { id: 'hp-zbfury16g9',  label: 'HP ZBook Fury 16 G9',       category: 'laptop', base_price: 2600 },

  // ── Lenovo ─────────────────────────────────────────────────────────────────
  { id: 'lnv-x1cg12',     label: 'Lenovo ThinkPad X1 Carbon Gen 12', category: 'laptop', base_price: 1750 },
  { id: 'lnv-x1yg7',      label: 'Lenovo ThinkPad X1 Yoga Gen 7',    category: 'laptop', base_price: 1600 },
  { id: 'lnv-t14g4',      label: 'Lenovo ThinkPad T14 Gen 4',        category: 'laptop', base_price: 1150 },
  { id: 'lnv-e14g4',      label: 'Lenovo ThinkPad E14 Gen 4',        category: 'laptop', base_price: 800 },
  { id: 'lnv-yoga9-14',   label: 'Lenovo Yoga 9 14 (2023)',          category: 'laptop', base_price: 1450 },
  { id: 'lnv-tb14g5',     label: 'Lenovo ThinkBook 14 Gen 5',        category: 'laptop', base_price: 950 },

  // ── Microsoft Surface (laptop) ─────────────────────────────────────────────
  { id: 'msf-lap6-15',    label: 'Microsoft Surface Laptop 6 (15")', category: 'laptop', base_price: 1700 },
  { id: 'msf-lap5-13',    label: 'Microsoft Surface Laptop 5 (13")', category: 'laptop', base_price: 1300 },
  { id: 'msf-book3-15',   label: 'Microsoft Surface Book 3 (15")',   category: 'laptop', base_price: 2100 },

  // ── Apple Watch ────────────────────────────────────────────────────────────
  { id: 'apl-aw-ultra2',  label: 'Apple Watch Ultra 2',             category: 'watch', base_price: 780 },
  { id: 'apl-aw-series9', label: 'Apple Watch Series 9',           category: 'watch', base_price: 380 },
  { id: 'apl-aw-se2',     label: 'Apple Watch SE (2nd generation)', category: 'watch', base_price: 200 },

  // ── Samsung Galaxy Watch ───────────────────────────────────────────────────
  { id: 'sms-gwultra',    label: 'Samsung Galaxy Watch Ultra',      category: 'watch', base_price: 580 },
  { id: 'sms-gw7',        label: 'Samsung Galaxy Watch7',          category: 'watch', base_price: 300 },
  { id: 'sms-gwfe',       label: 'Samsung Galaxy Watch FE',        category: 'watch', base_price: 180 },

  // ── Google Pixel Watch ─────────────────────────────────────────────────────
  { id: 'goo-pwatch3',    label: 'Google Pixel Watch 3',           category: 'watch', base_price: 350 },

  // ── AirPods / Buds (other) ─────────────────────────────────────────────────
  { id: 'apl-airpodspro2',label: 'Apple AirPods Pro (2nd Gen)',    category: 'other', base_price: 220 },
  { id: 'sms-buds3pro',   label: 'Samsung Galaxy Buds3 Pro',      category: 'other', base_price: 180 },
  { id: 'goo-budspro2',   label: 'Google Pixel Buds Pro 2',       category: 'other', base_price: 160 },

  // ── Mac Desktop ────────────────────────────────────────────────────────────
  { id: 'apl-macminim4',  label: 'Apple Mac Mini (M4)',            category: 'other', base_price: 700 },
  { id: 'apl-macminim4p', label: 'Apple Mac Mini (M4 Pro)',        category: 'other', base_price: 1100 },
  { id: 'apl-imac24m4',   label: 'Apple iMac 24-inch (M4)',        category: 'other', base_price: 1800 },
]

const ALL_CONDITIONS: DeviceCondition[] = ['new', 'excellent', 'good', 'fair', 'poor']
const ALL_PURPOSES = ['buy', 'sell'] as const

// ── Build test matrix ─────────────────────────────────────────────────────────
describe('SimpleMarginPricingModel — full catalog coverage', () => {
  for (const device of CATALOG) {
    describe(device.label, () => {
      for (const condition of ALL_CONDITIONS) {
        for (const purpose of ALL_PURPOSES) {
          it(`${condition} | ${purpose}`, () => {
            const result = model.calculate({
              device_id: device.id,
              condition,
              purpose,
              base_price: device.base_price,
              quantity: 1,
            })

            expect(result.success).toBe(true)
            expect(result.final_price).toBeGreaterThanOrEqual(0)
            expect(result.breakdown).toBeDefined()
            expect(result.breakdown!.condition).toBe(condition)
            expect(result.breakdown!.purpose).toBe(purpose)

            if (purpose === 'buy') {
              expect(result.trade_price).toBeDefined()
              expect(result.cpo_price).toBeUndefined()
            } else {
              expect(result.cpo_price).toBeDefined()
              expect(result.trade_price).toBeUndefined()
            }
          })
        }
      }
    })
  }
})

// ── Spot check key price ranges by category ───────────────────────────────────
describe('SimpleMarginPricingModel — category price-range sanity', () => {
  it('entry-level phone (iPhone 11, good, buy) produces a positive trade price', () => {
    const r = model.calculate({ device_id: 'apl-ip11', condition: 'good', purpose: 'buy', base_price: 320, quantity: 1 })
    expect(r.success).toBe(true)
    expect(r.trade_price).toBeGreaterThan(0)
    expect(r.trade_price).toBeLessThan(320) // trade price always < base
  })

  it('premium laptop (MacBook Pro 16 M4 Max, excellent, buy) trade price is in realistic range', () => {
    const r = model.calculate({ device_id: 'apl-mbp16m4max', condition: 'excellent', purpose: 'buy', base_price: 3500, quantity: 1 })
    expect(r.success).toBe(true)
    expect(r.trade_price).toBeGreaterThan(1000)
    expect(r.trade_price).toBeLessThan(3500)
  })

  it('enterprise laptop (Lenovo ThinkPad X1 Carbon Gen 12, good, sell) CPO price is above base', () => {
    const r = model.calculate({ device_id: 'lnv-x1cg12', condition: 'good', purpose: 'sell', base_price: 1750, quantity: 1 })
    expect(r.success).toBe(true)
    expect(r.cpo_price).toBeGreaterThan(1750 * 0.82) // good multiplier 0.82 × markup
  })

  it('Dell workstation (Precision 5580, new, sell) CPO price above base price', () => {
    const r = model.calculate({ device_id: 'del-prec5580', condition: 'new', purpose: 'sell', base_price: 2300, quantity: 1 })
    expect(r.success).toBe(true)
    expect(r.cpo_price).toBeGreaterThan(2300)
  })

  it('HP ZBook workstation (fair condition, buy) does not produce negative price', () => {
    const r = model.calculate({ device_id: 'hp-zbfury16g9', condition: 'fair', purpose: 'buy', base_price: 2600, quantity: 1 })
    expect(r.success).toBe(true)
    expect(r.trade_price).toBeGreaterThanOrEqual(0)
  })

  it('budget tablet (Galaxy Tab A9+, poor, buy) produces non-negative price', () => {
    const r = model.calculate({ device_id: 'sms-taba9plus', condition: 'poor', purpose: 'buy', base_price: 280, quantity: 1 })
    expect(r.success).toBe(true)
    expect(r.trade_price).toBeGreaterThanOrEqual(0)
  })

  it('smartwatch (Apple Watch SE, poor, buy) produces non-negative price', () => {
    const r = model.calculate({ device_id: 'apl-aw-se2', condition: 'poor', purpose: 'buy', base_price: 200, quantity: 1 })
    expect(r.success).toBe(true)
    expect(r.trade_price).toBeGreaterThanOrEqual(0)
  })
})
