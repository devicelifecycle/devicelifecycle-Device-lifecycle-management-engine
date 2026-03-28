import { config } from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import type { DeviceCondition } from '../src/types'

config({ path: resolve(process.cwd(), '.env.local') })

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const SAMPLE_TARGET = 12

const CONDITION_MULTIPLIERS: Record<DeviceCondition, number> = {
  new: 1.0,
  excellent: 0.95,
  good: 0.85,
  fair: 0.70,
  poor: 0.50,
}

function mapDeviceConditionToCompetitorCondition(condition: DeviceCondition): 'excellent' | 'good' | 'fair' | 'broken' {
  if (condition === 'new' || condition === 'excellent') return 'excellent'
  if (condition === 'fair') return 'fair'
  if (condition === 'poor') return 'broken'
  return 'good'
}

function round2(value: number): number {
  return Math.round(Math.max(value, 0) * 100) / 100
}

async function main() {
  const { PricingService } = await import('../src/services/pricing.service')
  const settings = await PricingService.getPricingSettings()

  console.log('\n🔎 CPO VALIDATION (MODEL OUTPUT VS FORMULA SOURCE)')
  console.log(`Time: ${new Date().toISOString()}`)

  const candidateMap = new Map<string, {
    device_id: string
    make: string
    model: string
    storage: string
    condition: DeviceCondition
  }>()

  const { data: competitorRows } = await supabase
    .from('competitor_prices')
    .select('device_id, storage, trade_in_price, device:device_catalog(make, model)')
    .gt('trade_in_price', 0)
    .order('updated_at', { ascending: false })
    .limit(1200)

  for (const row of competitorRows || []) {
    const deviceInfo = Array.isArray(row.device) ? row.device[0] : row.device
    if (!row.device_id || !row.storage || !deviceInfo?.make || !deviceInfo?.model) continue

    const inputCondition: DeviceCondition = 'good'
    const key = `${row.device_id}|${row.storage}`
    if (!candidateMap.has(key)) {
      candidateMap.set(key, {
        device_id: row.device_id,
        make: deviceInfo.make,
        model: deviceInfo.model,
        storage: row.storage,
        condition: inputCondition,
      })
    }
  }

  const candidates = Array.from(candidateMap.values())
  console.log(`Sampling up to ${SAMPLE_TARGET} valid device/storage combos from ${candidates.length} candidates`)

  let checked = 0
  let passed = 0

  for (const sample of candidates) {
    if (checked >= SAMPLE_TARGET) break

    const input = {
      device_id: sample.device_id,
      storage: sample.storage,
      condition: sample.condition,
      quantity: 1,
      risk_mode: 'retail' as const,
      carrier: 'Unlocked',
      issues: [] as string[],
    }

    const result = await PricingService.calculatePriceV2(input)
    if (!result.success) {
      console.log(`⚠️  SKIP ${sample.make} ${sample.model} ${sample.storage} (${sample.condition}) calculation failed: ${result.error || 'Unknown error'}`)
      continue
    }

    const competitorCondition = mapDeviceConditionToCompetitorCondition(input.condition)

    let { data: competitorData } = await supabase
      .from('competitor_prices')
      .select('sell_price, condition')
      .eq('device_id', input.device_id)
      .eq('storage', input.storage)
      .eq('condition', competitorCondition)

    if (!competitorData || competitorData.length === 0) {
      const fallback = await supabase
        .from('competitor_prices')
        .select('sell_price, condition')
        .eq('device_id', input.device_id)
        .eq('storage', input.storage)
      competitorData = fallback.data || []
    }

    const sellPrices = (competitorData || [])
      .filter((row) => !row.condition || row.condition === competitorCondition)
      .map((row) => Number(row.sell_price || 0))
      .filter((value) => Number.isFinite(value) && value > 0)

    const { data: marketEntry } = await supabase
      .from('market_prices')
      .select('cpo_price, marketplace_price, marketplace_good')
      .eq('device_id', input.device_id)
      .eq('storage', input.storage)
      .eq('carrier', input.carrier)
      .eq('is_active', true)
      .lte('effective_date', new Date().toISOString().split('T')[0])
      .order('effective_date', { ascending: false })
      .limit(1)
      .single()

    const cpoMarkup = settings.cpo_markup_percent / 100
    const conditionMultiplier = CONDITION_MULTIPLIERS[input.condition]
    const goodConditionMult = CONDITION_MULTIPLIERS.good

    let expected = 0
    let source = 'trade+markup'

    if (sellPrices.length > 0) {
      expected = round2(sellPrices.reduce((sum, value) => sum + value, 0) / sellPrices.length)
      source = 'competitor_sell_avg'
    } else if ((marketEntry?.cpo_price || 0) > 0) {
      const scale = conditionMultiplier / goodConditionMult
      expected = round2((marketEntry?.cpo_price || 0) * scale)
      source = 'market_cpo_scaled'
    } else {
      expected = round2(result.trade_price * (1 + cpoMarkup))
      source = 'trade_plus_markup'
    }

    const mpPrice = Number(marketEntry?.marketplace_price || marketEntry?.marketplace_good || 0)
    const anchorPrice = Number(result.wholesale_c_stock || result.breakdown.anchor_price || 0)
    const marketplaceAboveCstock = mpPrice > 0 && mpPrice >= anchorPrice

    if (mpPrice > 0 && marketplaceAboveCstock && expected > mpPrice) {
      expected = round2(mpPrice)
    }

    const actual = round2(result.cpo_price)
    const delta = round2(actual - expected)
    const ok = Math.abs(delta) < 0.01

    checked += 1
    if (ok) passed += 1

    console.log(
      `${ok ? '✅' : '❌'} ${sample.make} ${sample.model} ${sample.storage} ` +
      `actual=$${actual.toFixed(2)} expected=$${expected.toFixed(2)} delta=${delta.toFixed(2)} source=${source} condition=${sample.condition}`
    )
  }

  console.log(`\nSummary: ${passed}/${checked} exact CPO matches`) 
  console.log('✅ CPO validation complete.\n')
}

main().catch((error) => {
  console.error('CPO validation failed:', error)
  process.exit(1)
})
