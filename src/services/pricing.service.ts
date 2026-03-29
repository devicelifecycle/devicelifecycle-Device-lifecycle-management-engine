// ============================================================================
// PRICING SERVICE
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { sanitizeSearchInput } from '@/lib/utils'
import {
  CHANNEL_DECISION_THRESHOLDS,
  MARKETPLACE_FEE_PERCENT,
  COMPETITIVE_RELEVANCE_MIN,
  BREAKAGE_RISK_PERCENT,
  OUTLIER_DEVIATION_THRESHOLD,
  BROKEN_DEVICE_MULTIPLIER,
  RISK_MODE_CONFIG,
  ISSUE_TO_DEDUCTION_KEY,
} from '@/lib/constants'
import type {
  PricingTable,
  DeviceCondition,
  PriceCalculationInput,
  PriceCalculationResult,
  MarketPrice,
  CompetitorPrice,
  RepairCost,
  PriceCalculationResultV2,
  ChannelDecision,
  MarginTier,
  SalesChannel,
  RiskMode,
} from '@/types'

// Default margin settings (can be overridden from database)
const DEFAULT_MARGIN_SETTINGS = {
  trade_in_profit_percent: 20,
  trade_in_min_profit: 15,
  cpo_markup_percent: 18,
  cpo_enterprise_markup_percent: 15,
  testing_cost: 5,
  inbound_shipping_cost: 3,
  outbound_shipping_cost: 5,
  marketplace_fee_percent: 8,
  return_risk_percent: 3,
  processing_cost: 2,
}

// Condition multipliers
const CONDITION_MULTIPLIERS: Record<DeviceCondition, number> = {
  new: 1.0,
  excellent: 0.95,
  good: 0.85,
  fair: 0.70,
  poor: 0.50,
}

// Functional deductions
const FUNCTIONAL_DEDUCTIONS: Record<string, { type: 'percentage' | 'fixed'; value: number }> = {
  SCREEN_CRACK: { type: 'percentage', value: 15 },
  SCREEN_DEAD: { type: 'percentage', value: 40 },
  BATTERY_POOR: { type: 'fixed', value: 30 },
  BATTERY_DEAD: { type: 'fixed', value: 50 },
  CAMERA_BROKEN: { type: 'percentage', value: 20 },
  SPEAKER_BROKEN: { type: 'fixed', value: 25 },
  BUTTON_BROKEN: { type: 'fixed', value: 20 },
  WATER_DAMAGE: { type: 'percentage', value: 35 },
  ICLOUD_LOCKED: { type: 'percentage', value: 90 },
  CARRIER_LOCKED: { type: 'fixed', value: 50 },
}

const round2 = (n: number) => Math.round(Math.max(n, 0) * 100) / 100
const safeNum = (n: number) => Number.isFinite(n) ? n : 0

/** Critical issues that make device "broken" — use 50% of good rule (Brian's algorithm) */
const CRITICAL_BROKEN_ISSUES = ['SCREEN_DEAD', 'ICLOUD_LOCKED', 'WATER_DAMAGE', 'BATTERY_DEAD']

/** Maps triage/display issue labels to FUNCTIONAL_DEDUCTIONS keys. Logs unmapped issues. */
function mapIssuesToDeductionKeys(issues: string[]): string[] {
  const keys: string[] = []
  for (const issue of issues) {
    if (FUNCTIONAL_DEDUCTIONS[issue]) {
      keys.push(issue)
    } else {
      const mapped = ISSUE_TO_DEDUCTION_KEY[issue]
      if (mapped && FUNCTIONAL_DEDUCTIONS[mapped]) {
        keys.push(mapped)
      } else if (!mapped) {
        console.warn(`[Pricing] Issue has no matching deduction: "${issue}"`)
      }
    }
  }
  return keys
}

/** Device is "broken" — apply 50% of good working rule per Brian */
function isBrokenDevice(condition: DeviceCondition, deductionKeys: string[]): boolean {
  if (condition === 'poor') return true
  return deductionKeys.some(k => CRITICAL_BROKEN_ISSUES.includes(k))
}

/** Filter competitor outliers — discard highest if >1.3x second-highest (e.g. Bell promotion) */
function filterCompetitorOutliers(
  list: Array<{ name: string; price: number }>
): Array<{ name: string; price: number }> {
  if (list.length < 4) return list
  const sorted = [...list].sort((a, b) => b.price - a.price)
  const highest = sorted[0].price
  const secondHighest = sorted[1].price
  if (secondHighest > 0 && highest > secondHighest * 1.3) {
    return list.filter(c => c.price < highest)
  }
  return list
}

function mapDeviceConditionToCompetitorCondition(condition: DeviceCondition): 'excellent' | 'good' | 'fair' | 'broken' {
  if (condition === 'new' || condition === 'excellent') return 'excellent'
  if (condition === 'fair') return 'fair'
  if (condition === 'poor') return 'broken'
  return 'good'
}

export interface PricingSettingsOverrides {
  channel_green_min: number
  channel_yellow_min: number
  marketplace_fee_percent: number
  breakage_risk_percent: number
  competitive_relevance_min: number
  competitor_ceiling_percent: number
  beat_competitor_percent: number
  outlier_deviation_threshold: number
  trade_in_profit_percent: number
  enterprise_margin_percent: number
  cpo_markup_percent: number
  cpo_enterprise_markup_percent: number
  price_staleness_days: number
  margin_mode: 'auto' | 'custom'
  custom_margin_percent: number
  custom_margin_amount: number
  /** Use our trained data-driven model when true (reduces third-party dependency) */
  prefer_data_driven?: boolean
}

const DEFAULT_PRICING_SETTINGS: PricingSettingsOverrides = {
  channel_green_min: CHANNEL_DECISION_THRESHOLDS.GREEN_MIN,
  channel_yellow_min: CHANNEL_DECISION_THRESHOLDS.YELLOW_MIN,
  marketplace_fee_percent: MARKETPLACE_FEE_PERCENT,
  breakage_risk_percent: BREAKAGE_RISK_PERCENT,
  competitive_relevance_min: COMPETITIVE_RELEVANCE_MIN,
  competitor_ceiling_percent: 2,
  beat_competitor_percent: 0,
  outlier_deviation_threshold: OUTLIER_DEVIATION_THRESHOLD,
  trade_in_profit_percent: 20,
  enterprise_margin_percent: 12,
  cpo_markup_percent: 18,
  cpo_enterprise_markup_percent: 15,
  price_staleness_days: 7,
  margin_mode: 'auto',
  custom_margin_percent: 0,
  custom_margin_amount: 0,
}

export class PricingService {

  /**
   * Single source of truth for margin, beat %, and all pricing knobs.
   * Used by: order flow, quote API, calculate-batch, reprice-mismatches, and admin pricing page.
   * Changes in Admin → Pricing → Settings apply to the entire system, not just the pricing page.
   */
  static async getPricingSettings(): Promise<PricingSettingsOverrides> {
    try {
      const supabase = createServerSupabaseClient()
      const { data, error } = await supabase
        .from('pricing_settings')
        .select('setting_key, setting_value')
      if (error || !data || data.length === 0) return DEFAULT_PRICING_SETTINGS
      const overrides = { ...DEFAULT_PRICING_SETTINGS }
      for (const row of data) {
        const key = row.setting_key as keyof PricingSettingsOverrides
        if (key in overrides) {
          if (key === 'prefer_data_driven') {
            ;(overrides as Record<string, unknown>)[key] = row.setting_value === 'true' || row.setting_value === '1'
          } else if (key === 'margin_mode') {
            ;(overrides as Record<string, unknown>)[key] = row.setting_value === 'custom' ? 'custom' : 'auto'
          } else {
            const num = parseFloat(row.setting_value)
            if (!Number.isNaN(num)) (overrides as unknown as Record<string, number>)[key] = num
          }
        }
      }
      return overrides
    } catch {
      return DEFAULT_PRICING_SETTINGS
    }
  }

  // ============================================================================
  // V2: MARKET-REFERENCED PRICING (Primary)
  // ============================================================================

  /**
   * Calculate price using market-referenced competitive model.
   * Uses getPricingSettings() for margin %, beat_competitor %, etc. — so Admin Settings apply
   * to orders, quotes, and all API callers, not just the pricing page.
   * Algorithm from company's "COE Engine Pricing Alg" spreadsheet:
   * 1. Anchor on wholesale C-stock price
   * 2. Apply condition + deductions
   * 3. Compare against competitor trade-in offers
   * 4. Ensure competitive relevance
   * 5. Calculate margin & route to optimal sales channel
   * 6. Compute repair buffer for value-add decisions
   */
  static async calculatePriceV2(input: {
    device_id: string;
    storage: string;
    carrier?: string;
    condition: DeviceCondition;
    issues?: string[];
    quantity?: number;
    risk_mode?: RiskMode;
    beat_competitor_percent?: number;
    trade_in_profit_percent?: number;
    enterprise_margin_percent?: number;
    cpo_markup_percent?: number;
  }): Promise<PriceCalculationResultV2> {
    const supabase = createServerSupabaseClient()
    const carrier = input.carrier || 'Unlocked'
    const settings = await this.getPricingSettings()

    try {
      // Step 1: Get market reference prices
      const { data: marketEntry } = await supabase
        .from('market_prices')
        .select('*, device:device_catalog(*)')
        .eq('device_id', input.device_id)
        .eq('storage', input.storage)
        .eq('carrier', carrier)
        .eq('is_active', true)
        .lte('effective_date', new Date().toISOString().split('T')[0])
        .order('effective_date', { ascending: false })
        .limit(1)
        .single()

      // Anchor priority: prefer competitor data when available (trade-in offers) over market wholesale.
      // Wholesale/market can inflate quotes; competitors reflect what customers actually get.
      // First try same-condition competitors, then fall back to all conditions.
      const competitorConditionForAnchor = mapDeviceConditionToCompetitorCondition(input.condition)
      const { data: compForAnchorCondition } = await supabase
        .from('competitor_prices')
        .select('trade_in_price, updated_at, scraped_at')
        .eq('device_id', input.device_id)
        .eq('storage', input.storage)
        .eq('condition', competitorConditionForAnchor)
        .not('trade_in_price', 'is', null)
        .gt('trade_in_price', 0)

      const staleDays = 14
      const staleCutoff = new Date(Date.now() - staleDays * 24 * 60 * 60 * 1000)
      const extractFreshPrices = (rows: Array<{ trade_in_price?: number; updated_at?: string; scraped_at?: string }> | null): number[] =>
        (rows || [])
          .filter((c) => {
            const ts = c.updated_at || c.scraped_at
            return ts && new Date(ts) > staleCutoff
          })
          .map((c) => Number(c.trade_in_price) || 0)
          .filter((p: number) => p > 0)

      let freshCompetitorPrices = extractFreshPrices(compForAnchorCondition)

      // Fall back to all conditions if no same-condition prices found
      if (freshCompetitorPrices.length === 0) {
        const { data: compForAnchorAll } = await supabase
          .from('competitor_prices')
          .select('trade_in_price, updated_at, scraped_at')
          .eq('device_id', input.device_id)
          .eq('storage', input.storage)
          .not('trade_in_price', 'is', null)
          .gt('trade_in_price', 0)
        freshCompetitorPrices = extractFreshPrices(compForAnchorAll)
      }

      let anchorPrice = 0
      // Track whether anchor is a "new/base" equivalent (needs condition multiplier)
      // vs already condition-specific (skip condition multiplier in Step 2)
      let anchorIsBaseNormalized = false
      if (freshCompetitorPrices.length > 0) {
        anchorPrice = freshCompetitorPrices.reduce((s: number, p: number) => s + p, 0) / freshCompetitorPrices.length
        // Same-condition competitor prices are already condition-specific
        anchorIsBaseNormalized = false
      }
      if (!anchorPrice) {
        anchorPrice = marketEntry?.wholesale_c_stock || 0
        if (anchorPrice) anchorIsBaseNormalized = true // wholesale is a "new" base price
      }
      if (!anchorPrice) {
        const { data: pricingEntry } = await supabase
          .from('pricing_tables')
          .select('*')
          .eq('device_id', input.device_id)
          .eq('storage', input.storage)
          .eq('condition', 'new')
          .eq('carrier', carrier)
          .eq('is_active', true)
          .lte('effective_date', new Date().toISOString().split('T')[0])
          .order('effective_date', { ascending: false })
          .limit(1)
          .single()
        anchorPrice = pricingEntry?.base_price || 0
        if (anchorPrice) anchorIsBaseNormalized = true // pricing table condition='new'
      }
      if (!anchorPrice) {
        const { data: compFallback } = await supabase
          .from('competitor_prices')
          .select('trade_in_price')
          .eq('device_id', input.device_id)
          .eq('storage', input.storage)
        const tradePrices = (compFallback || [])
          .map((c: { trade_in_price?: number }) => c.trade_in_price || 0)
          .filter((p: number) => p > 0)
        if (tradePrices.length > 0) {
          anchorPrice = tradePrices.reduce((s: number, p: number) => s + p, 0) / tradePrices.length
          anchorIsBaseNormalized = true // mixed conditions — treat as approximate base
        }
      }

      // Fallback: same device, any storage — use competitor or market data from other storage variants (e.g. UNKNOWN → 128GB)
      if (!anchorPrice) {
        const { data: compAnyStorage } = await supabase
          .from('competitor_prices')
          .select('trade_in_price')
          .eq('device_id', input.device_id)
        const tradePrices = (compAnyStorage || [])
          .map((c: { trade_in_price?: number }) => c.trade_in_price || 0)
          .filter((p: number) => p > 0)
        if (tradePrices.length > 0) {
          anchorPrice = tradePrices.reduce((s: number, p: number) => s + p, 0) / tradePrices.length
          anchorIsBaseNormalized = true // mixed conditions+storage — treat as approximate base
        }
      }
      if (!anchorPrice) {
        const { data: marketAnyStorage } = await supabase
          .from('market_prices')
          .select('wholesale_c_stock')
          .eq('device_id', input.device_id)
          .eq('is_active', true)
          .not('wholesale_c_stock', 'is', null)
          .limit(10)
        const stocks = (marketAnyStorage || [])
          .map((m: { wholesale_c_stock?: number }) => m.wholesale_c_stock || 0)
          .filter((p: number) => p > 0)
        if (stocks.length > 0) {
          anchorPrice = stocks.reduce((s: number, p: number) => s + p, 0) / stocks.length
          anchorIsBaseNormalized = true // wholesale is a base price
        }
      }

      // Fallback: trained_pricing_baselines — our own historical data
      // Checks: exact (device+storage+condition) → any storage → cross-condition
      if (!anchorPrice) {
        const condMult = CONDITION_MULTIPLIERS[input.condition] ?? 0.85

        // 1. Exact match
        const { data: exactBaseline } = await supabase
          .from('trained_pricing_baselines')
          .select('median_trade_price')
          .eq('device_id', input.device_id)
          .eq('storage', input.storage)
          .eq('condition', input.condition)
          .order('last_trained_at', { ascending: false })
          .limit(1)
          .single()
        if ((exactBaseline?.median_trade_price ?? 0) > 0) {
          anchorPrice = exactBaseline!.median_trade_price / condMult
          anchorIsBaseNormalized = true // divided by condMult → base equivalent
        }

        // 2. Same device, any storage, same condition
        if (!anchorPrice) {
          const { data: anyStorage } = await supabase
            .from('trained_pricing_baselines')
            .select('median_trade_price, condition')
            .eq('device_id', input.device_id)
            .eq('condition', input.condition)
            .gt('median_trade_price', 0)
            .limit(1)
            .single()
          if ((anyStorage?.median_trade_price ?? 0) > 0) {
            anchorPrice = anyStorage!.median_trade_price / condMult
            anchorIsBaseNormalized = true
          }
        }

        // 3. Same device, different condition — scale to "new" equivalent using condition multiplier ratio
        if (!anchorPrice) {
          const { data: otherCond } = await supabase
            .from('trained_pricing_baselines')
            .select('median_trade_price, condition')
            .eq('device_id', input.device_id)
            .gt('median_trade_price', 0)
            .order('last_trained_at', { ascending: false })
            .limit(5)
          if (otherCond && otherCond.length > 0) {
            const ref = otherCond.find(r => r.condition === 'good') ?? otherCond[0]
            const refMult = CONDITION_MULTIPLIERS[ref.condition as DeviceCondition] ?? 0.85
            if (refMult > 0) {
              anchorPrice = ref.median_trade_price / refMult
              anchorIsBaseNormalized = true
            }
          }
        }
      }

      if (!anchorPrice) {
        return this.v2ErrorResult('Device not found in market prices, pricing table, competitor data, or trained baselines. Add pricing data or run the scraper.')
      }

      // Step 2: Apply condition multiplier (only when anchor is a base/"new" equivalent)
      const conditionMultiplier = CONDITION_MULTIPLIERS[input.condition] || 1.0
      const conditionAdjustment = anchorIsBaseNormalized ? anchorPrice * (1 - conditionMultiplier) : 0
      let adjustedPrice = anchorIsBaseNormalized ? anchorPrice * conditionMultiplier : anchorPrice

      // Step 3: Apply functional deductions (map triage labels to deduction keys)
      let totalDeductions = 0
      const deductionKeys = mapIssuesToDeductionKeys(input.issues || [])
      if (deductionKeys.length > 0) {
        for (const issue of deductionKeys) {
          const deduction = FUNCTIONAL_DEDUCTIONS[issue]
          if (deduction) {
            if (deduction.type === 'percentage') {
              const amt = adjustedPrice * (deduction.value / 100)
              totalDeductions += amt
              adjustedPrice -= amt
            } else {
              totalDeductions += deduction.value
              adjustedPrice -= deduction.value
            }
          }
        }
      }

      // Ensure price never goes negative after deductions
      adjustedPrice = Math.max(adjustedPrice, 0)

      const isBroken = isBrokenDevice(input.condition, deductionKeys)

      // Step 4: Get competitor prices (filter outliers — e.g. Bell promotion)
      const competitorCondition = mapDeviceConditionToCompetitorCondition(input.condition)
      let { data: competitorData } = await supabase
        .from('competitor_prices')
        .select('*')
        .eq('device_id', input.device_id)
        .eq('storage', input.storage)
        .eq('condition', competitorCondition)

      if (!competitorData || competitorData.length === 0) {
        const fallback = await supabase
          .from('competitor_prices')
          .select('*')
          .eq('device_id', input.device_id)
          .eq('storage', input.storage)
        competitorData = fallback.data || []
      }

      const rawCompetitors: Array<{ name: string; price: number }> = []
      const rawCompetitorSellPrices: number[] = []
      let competitorDataAgeDays: number | undefined

      if (competitorData && competitorData.length > 0) {
        const now = Date.now()
        let maxAgeMs = 0
        for (const cp of competitorData) {
          const price = cp.trade_in_price || 0
          const sellPrice = cp.sell_price || 0
          const updatedAt = cp.updated_at || cp.scraped_at || cp.created_at
          const cpCondition = (cp as CompetitorPrice).condition
          if (updatedAt) {
            const ageMs = now - new Date(updatedAt).getTime()
            if (ageMs > maxAgeMs) maxAgeMs = ageMs
          }
          if (price > 0) rawCompetitors.push({ name: cp.competitor_name || 'Unknown', price })
          // Only use sell prices for our condition — when fallback fetches all conditions, avoid mixing
          if (sellPrice > 0 && (!cpCondition || cpCondition === competitorCondition)) {
            rawCompetitorSellPrices.push(sellPrice)
          }
        }
        if (maxAgeMs > 0) {
          competitorDataAgeDays = round2(maxAgeMs / (24 * 60 * 60 * 1000))
        }
      }

      const filteredCompetitors = filterCompetitorOutliers(rawCompetitors)
      const competitors: Array<{ name: string; price: number; gap_percent: number }> = filteredCompetitors.map(c => ({
        name: c.name,
        price: c.price,
        gap_percent: round2(anchorPrice > 0 ? (anchorPrice - c.price) / anchorPrice * 100 : 0) / 100,
      }))
      const highestCompetitor = filteredCompetitors.length > 0 ? Math.max(...filteredCompetitors.map(c => c.price)) : 0
      const avgCompetitorPrice = filteredCompetitors.length > 0
        ? filteredCompetitors.reduce((s, c) => s + c.price, 0) / filteredCompetitors.length
        : 0

      // Step 5: Risk mode — enterprise has lower margin target. API overrides take precedence over saved settings.
      const riskMode: RiskMode = input.risk_mode || 'retail'
      const enterpriseOverride = input.enterprise_margin_percent != null && input.enterprise_margin_percent >= 0
      const retailOverride = input.trade_in_profit_percent != null && input.trade_in_profit_percent >= 0
      let marginTargetPercent: number
      if (riskMode === 'enterprise' && enterpriseOverride) {
        marginTargetPercent = input.enterprise_margin_percent!
      } else if (retailOverride) {
        marginTargetPercent = input.trade_in_profit_percent!
      } else if (riskMode === 'enterprise') {
        marginTargetPercent = settings.enterprise_margin_percent
      } else if (settings.margin_mode === 'custom') {
        if (settings.custom_margin_percent > 0) {
          marginTargetPercent = settings.custom_margin_percent
        } else if (settings.custom_margin_amount > 0 && anchorPrice > 0) {
          marginTargetPercent = (settings.custom_margin_amount / anchorPrice) * 100
        } else {
          marginTargetPercent = settings.trade_in_profit_percent
        }
      } else {
        marginTargetPercent = settings.trade_in_profit_percent
      }
      const marginTarget = marginTargetPercent / 100

      // Step 6: Marketplace data and D-grade formula
      const mpPrice = marketEntry?.marketplace_price || marketEntry?.marketplace_good || 0
      const mpFeeRate = settings.marketplace_fee_percent / 100
      const mpNet = mpPrice > 0 ? mpPrice * (1 - mpFeeRate) : 0

      // Get repair costs for value-add viability and D-grade formula
      const { data: repairCosts } = await supabase
        .from('repair_costs')
        .select('*')
        .eq('is_active', true)

      const avgRepairCost = repairCosts && repairCosts.length > 0
        ? repairCosts.reduce((sum: number, r: RepairCost) => sum + r.cost, 0) / repairCosts.length
        : 40
      const minRepairCost = repairCosts && repairCosts.length > 0
        ? Math.min(...repairCosts.map((r: RepairCost) => r.cost))
        : 25

      // D-grade formula (Faisal's method): selling_price - fees - margin - repairs - breakage = trade_price
      // Brian: "If marketplace isn't above C stock price, someone's low-balling — don't use for formula"
      let dGradeFormula = undefined
      const marketplaceAboveCstock = mpPrice > 0 && mpPrice >= anchorPrice
      if (isBroken && mpPrice > 0 && marketplaceAboveCstock) {
        const feeDeduction = mpPrice * mpFeeRate
        const marginDeduction = mpPrice * marginTarget
        const estimatedRepairs = avgRepairCost
        const breakageDeduction = mpPrice * (settings.breakage_risk_percent / 100)
        const dGradeTradePrice = mpPrice - feeDeduction - marginDeduction - estimatedRepairs - breakageDeduction

        dGradeFormula = {
          selling_price: round2(mpPrice),
          marketplace_fees: round2(feeDeduction),
          margin_deduction: round2(marginDeduction),
          estimated_repairs: round2(estimatedRepairs),
          breakage_risk: round2(breakageDeduction),
          calculated_trade_price: round2(Math.max(dGradeTradePrice, 0)),
        }
      }

      // Step 7: Apply breakage risk deduction to adjusted price
      const breakageDeduction = adjustedPrice * (settings.breakage_risk_percent / 100)
      adjustedPrice -= breakageDeduction

      // Step 7b: "Good working" trade price for broken-device rule (Brian: broken = 50% of good)
      const goodConditionMult = CONDITION_MULTIPLIERS['good'] ?? 0.85
      // When anchor is condition-specific, convert to base first then apply good multiplier
      const goodWorkingAnchor = anchorIsBaseNormalized
        ? anchorPrice * goodConditionMult
        : conditionMultiplier > 0
          ? anchorPrice * (goodConditionMult / conditionMultiplier)
          : anchorPrice
      const goodWorkingBreakage = goodWorkingAnchor * (settings.breakage_risk_percent / 100)
      const goodWorkingAfterBreakage = Math.max(goodWorkingAnchor - goodWorkingBreakage, 0)
      const competitiveFloor = highestCompetitor * settings.competitive_relevance_min
      const dGradeFloor = isBroken && dGradeFormula ? dGradeFormula.calculated_trade_price : 0
      const goodWorkingTradePrice = Math.max(
        goodWorkingAfterBreakage,
        competitiveFloor,
        dGradeFloor
      )

      // Step 8: Determine trade price (competitive relevance)
      const beatPercent = (input.beat_competitor_percent ?? settings.beat_competitor_percent ?? 0)
      const useBeatPricing = beatPercent > 0 && filteredCompetitors.length > 0 && highestCompetitor > 0

      let tradePrice: number
      let competitorCeilingApplied = false
      let competitorCeilingValue: number | undefined
      let beatPricingApplied = false

      const hasMarginOverride = retailOverride || enterpriseOverride
      if (useBeatPricing) {
        // Beat competitors: offer X% above highest to win deals (best price)
        tradePrice = round2(highestCompetitor * (1 + beatPercent / 100))
        if (isBroken) {
          tradePrice = round2(tradePrice * BROKEN_DEVICE_MULTIPLIER)
        }
        beatPricingApplied = true
      } else if (isBroken) {
        // Brian: "Broken could just be 50% of good" — simple rule
        tradePrice = round2(goodWorkingTradePrice * BROKEN_DEVICE_MULTIPLIER)
      } else {
        // Apply margin target when override is provided; otherwise use stored market trade_price or anchor-based
        if (hasMarginOverride) {
          // Our Quote = Avg × (1 − margin%). Use competitor avg when available, else anchor-based.
          if (avgCompetitorPrice > 0) {
            tradePrice = round2(avgCompetitorPrice * (1 - marginTarget))
          } else {
            // No competitors: apply margin to anchor-derived value (pre-breakage, pre-deductions)
            // When anchor is already condition-specific, don't re-apply conditionMultiplier
            const conditionAdjustedAnchor = anchorIsBaseNormalized ? anchorPrice * conditionMultiplier : anchorPrice
            const preBreakageValue = conditionAdjustedAnchor - totalDeductions
            tradePrice = round2(preBreakageValue * (1 - marginTarget) - breakageDeduction)
            tradePrice = Math.max(tradePrice, 0)
          }
          tradePrice = Math.max(tradePrice, competitiveFloor)
        } else {
          tradePrice = marketEntry?.trade_price || 0
          if (!tradePrice) {
            tradePrice = Math.max(adjustedPrice, competitiveFloor)
          }
          // Enforce minimum margin even in default path — prevent overpaying for trade-ins
          if (anchorPrice > 0) {
            const maxTradeAtMargin = round2(anchorPrice * (1 - marginTarget))
            if (tradePrice > maxTradeAtMargin) {
              tradePrice = Math.max(maxTradeAtMargin, competitiveFloor)
            }
          }
        }

        if (filteredCompetitors.length > 0 && highestCompetitor > 0) {
          const ceilingMultiplier = Math.max(0, settings.competitor_ceiling_percent) / 100
          const competitorCeiling = highestCompetitor * (1 + ceilingMultiplier)
          competitorCeilingValue = round2(competitorCeiling)
          const clampedTradePrice = Math.min(tradePrice, competitorCeiling)
          competitorCeilingApplied = clampedTradePrice < tradePrice
          tradePrice = clampedTradePrice
        }
      }

      // Step 9: Calculate margin vs C-stock
      const marginPercent = safeNum(anchorPrice > 0 ? (anchorPrice - tradePrice) / anchorPrice : 0)

      // Step 10: Repair buffer
      const repairBuffer = mpNet > 0 ? mpNet - tradePrice : 0

      const suggestedRepairs: Array<{ type: string; cost: number }> = []
      const repairKeys = new Set<string>()
      if (repairBuffer > 0 && repairCosts) {
        for (const rc of repairCosts as RepairCost[]) {
          const key = `${rc.repair_type}|${rc.cost}`
          if (rc.cost <= repairBuffer && !repairKeys.has(key)) {
            repairKeys.add(key)
            suggestedRepairs.push({ type: rc.repair_type, cost: rc.cost })
          }
        }
      }

      // Step 11: Channel routing decision
      let marginTier: MarginTier
      let recommendedChannel: SalesChannel
      let reasoning: string

      if (marginPercent >= settings.channel_green_min) {
        marginTier = 'green'
        recommendedChannel = 'wholesale'
        reasoning = `${round2(marginPercent * 100)}% margin — strong. Direct wholesale viable.`
      } else if (marginPercent >= settings.channel_yellow_min) {
        marginTier = 'yellow'
        recommendedChannel = mpNet > tradePrice ? 'marketplace' : 'wholesale'
        reasoning = `${round2(marginPercent * 100)}% margin — moderate. Check MP opportunity, evaluate value-add.`
      } else {
        marginTier = 'red'
        recommendedChannel = 'marketplace'
        reasoning = `${round2(marginPercent * 100)}% margin — tight. Route to marketplace.`
      }

      // Append risk mode context
      if (beatPricingApplied) {
        reasoning = `Beat competitors by ${beatPercent}% — offering best price ($${round2(tradePrice)}) to win deals.`
      } else {
        reasoning += ` [${riskMode} mode, ${marginTargetPercent}% target margin]`
        if (competitorCeilingApplied && competitorCeilingValue != null) {
          reasoning += ` [competitor ceiling applied at $${competitorCeilingValue}]`
        }
      }

      const channelDecision: ChannelDecision = {
        recommended_channel: recommendedChannel,
        margin_percent: round2(marginPercent * 100) / 100,
        margin_tier: marginTier,
        reasoning,
        marketplace_net: round2(mpNet),
        repair_buffer: round2(repairBuffer),
        value_add_viable: repairBuffer > minRepairCost,
      }

      // Step 12: CPO price — prefer competitor sell prices, then market entry, then markup on trade. Cap at marketplace to stay competitive.
      const cpoMarkupOverride = input.cpo_markup_percent != null && input.cpo_markup_percent >= 0
      const cpoMarkup = cpoMarkupOverride
        ? (input.cpo_markup_percent! / 100)
        : riskMode === 'enterprise'
          ? (settings.cpo_enterprise_markup_percent / 100)
          : (settings.cpo_markup_percent / 100)
      let cpoPrice: number
      if (rawCompetitorSellPrices.length > 0) {
        // Use average competitor CPO/sell price (condition-specific) as our CPO reference
        const avgCompetitorSell = rawCompetitorSellPrices.reduce((s, p) => s + p, 0) / rawCompetitorSellPrices.length
        cpoPrice = round2(avgCompetitorSell)
      } else if (marketEntry?.cpo_price) {
        // Market cpo_price is per device/storage with no condition — scale by condition multiplier so CPO varies
        const scale = conditionMultiplier / goodConditionMult
        cpoPrice = round2(marketEntry.cpo_price * scale)
      } else {
        // Fallback: trade price + markup (trade price already varies by condition)
        cpoPrice = round2(tradePrice * (1 + cpoMarkup))
      }
      // Cap CPO at marketplace price when available — don't exceed market
      if (mpPrice > 0 && marketplaceAboveCstock && cpoPrice > mpPrice) {
        cpoPrice = round2(mpPrice)
      }

      // Step 13: Outlier detection — compare trade price against historical sales
      let outlierFlag = false
      let outlierReason: string | undefined
      const { data: recentSales } = await supabase
        .from('sales_history')
        .select('sold_price')
        .eq('device_id', input.device_id)
        .eq('storage', input.storage)
        .gte('sold_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .limit(20)

      if (recentSales && recentSales.length >= 3) {
        const historicalAvg = recentSales.reduce((s: number, d: { sold_price: number }) => s + d.sold_price, 0) / recentSales.length
        if (historicalAvg > 0) {
          const deviation = Math.abs(tradePrice - historicalAvg) / historicalAvg
          if (deviation > settings.outlier_deviation_threshold) {
            outlierFlag = true
            outlierReason = `Trade price $${round2(tradePrice)} deviates ${round2(deviation * 100)}% from 30-day avg $${round2(historicalAvg)} (threshold: ${settings.outlier_deviation_threshold * 100}%)`
          }
        }
      }

      // Determine price source
      const priceSource = marketEntry ? 'Market Data' : 'Pricing Table'

      // Apply quantity
      const qty = input.quantity || 1

      const dataStalenessWarnings: string[] = []
      if (mpPrice > 0 && !marketplaceAboveCstock) {
        dataStalenessWarnings.push(`Marketplace price ($${round2(mpPrice)}) below C-stock ($${round2(anchorPrice)}) — excluded from formula (possible low-baller).`)
      }
      let confidence = this.calculateConfidenceV2(!!marketEntry, competitors.length, marketplaceAboveCstock && mpPrice > 0)
      if (competitorDataAgeDays != null && competitorDataAgeDays > settings.price_staleness_days) {
        dataStalenessWarnings.push(`Competitor data is ${competitorDataAgeDays} days old (threshold: ${settings.price_staleness_days}). Consider refreshing prices.`)
        confidence = Math.max(0, confidence - 0.15)
      }
      const dataStalenessWarning = dataStalenessWarnings.length > 0 ? dataStalenessWarnings.join(' ') : undefined
      const validForHours = (confidence < 0.7 || outlierFlag) ? 12 : 24
      const priceExpiresAt = new Date(Date.now() + validForHours * 60 * 60 * 1000).toISOString()

      const breakdown: PriceCalculationResultV2['breakdown'] & {
        broken_applied?: boolean
        good_working_trade_price?: number
        broken_multiplier?: number
      } = {
        anchor_price: anchorPrice,
        condition_adjustment: round2(conditionAdjustment),
        deductions: round2(totalDeductions),
        breakage_deduction: round2(breakageDeduction),
        margin_applied: round2(marginPercent * 100),
        final_trade_price: round2(tradePrice),
        final_cpo_price: round2(cpoPrice),
      }

      if (isBroken) {
        breakdown.broken_applied = true
        breakdown.good_working_trade_price = round2(goodWorkingTradePrice)
        breakdown.broken_multiplier = BROKEN_DEVICE_MULTIPLIER
      }

      return {
        success: true,
        trade_price: round2(tradePrice * qty),
        cpo_price: round2(cpoPrice * qty),
        margin_target_percent: round2(marginTargetPercent),
        wholesale_c_stock: anchorPrice,
        marketplace_price: mpPrice || undefined,
        marketplace_net: mpNet > 0 ? round2(mpNet) : undefined,
        competitors,
        highest_competitor: highestCompetitor > 0 ? highestCompetitor : undefined,
        channel_decision: channelDecision,
        repair_buffer: repairBuffer > 0 ? round2(repairBuffer) : undefined,
        suggested_repairs: suggestedRepairs.length > 0 ? suggestedRepairs : undefined,
        d_grade_formula: dGradeFormula,
        risk_mode: riskMode,
        outlier_flag: outlierFlag || undefined,
        outlier_reason: outlierReason,
        price_source: priceSource,
        confidence,
        price_date: new Date().toISOString(),
        valid_for_hours: validForHours,
        price_expires_at: priceExpiresAt,
        competitor_data_age_days: competitorDataAgeDays,
        data_staleness_warning: dataStalenessWarning,
        breakdown,
      }
    } catch (error) {
      return this.v2ErrorResult(error instanceof Error ? error.message : 'Unknown error')
    }
  }

  private static v2ErrorResult(errorMsg: string): PriceCalculationResultV2 {
    return {
      success: false,
      trade_price: 0,
      cpo_price: 0,
      competitors: [],
      channel_decision: {
        recommended_channel: 'wholesale',
        margin_percent: 0,
        margin_tier: 'red',
        reasoning: errorMsg,
        value_add_viable: false,
      },
      risk_mode: 'retail',
      confidence: 0,
      price_date: new Date().toISOString(),
      valid_for_hours: 0,
      breakdown: {
        anchor_price: 0,
        condition_adjustment: 0,
        deductions: 0,
        breakage_deduction: 0,
        margin_applied: 0,
        final_trade_price: 0,
        final_cpo_price: 0,
      },
      error: errorMsg,
    }
  }

  private static calculateConfidenceV2(
    hasMarketData: boolean,
    competitorCount: number,
    hasMarketplacePrice: boolean
  ): number {
    let confidence = 0
    if (hasMarketData) confidence += 0.4
    if (competitorCount >= 2) confidence += 0.3
    else if (competitorCount >= 1) confidence += 0.15
    if (hasMarketplacePrice) confidence += 0.3
    return Math.min(confidence, 1.0)
  }

  // ============================================================================
  // MARKET PRICES CRUD
  // ============================================================================

  static async getMarketPrices(deviceId?: string): Promise<MarketPrice[]> {
    const supabase = createServerSupabaseClient()
    let query = supabase
      .from('market_prices')
      .select('*, device:device_catalog(*)')
      .eq('is_active', true)
      .order('effective_date', { ascending: false })

    if (deviceId) {
      query = query.eq('device_id', deviceId)
    }

    const { data, error } = await query
    if (error) throw new Error(error.message)
    return (data || []) as MarketPrice[]
  }

  static async createMarketPrice(input: Omit<MarketPrice, 'id' | 'created_at' | 'updated_at' | 'device'>, userId: string): Promise<MarketPrice> {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('market_prices')
      .insert({ ...input, is_active: true, updated_by_id: userId })
      .select('*, device:device_catalog(*)')
      .single()

    if (error) throw new Error(error.message)
    return data as MarketPrice
  }

  static async updateMarketPrice(id: string, input: Partial<MarketPrice>, userId: string): Promise<MarketPrice> {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('market_prices')
      .update({ ...input, updated_by_id: userId, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*, device:device_catalog(*)')
      .single()

    if (error) throw new Error(error.message)
    return data as MarketPrice
  }

  static async deleteMarketPrice(id: string): Promise<void> {
    const supabase = createServerSupabaseClient()
    const { error } = await supabase.from('market_prices').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  // ============================================================================
  // COMPETITOR PRICES CRUD
  // ============================================================================

  private static conditionOrder(condition?: string): number {
    if (condition === 'excellent') return 0
    if (condition === 'good') return 1
    if (condition === 'fair') return 2
    if (condition === 'broken') return 3
    return 4
  }

  static async getCompetitorPrices(deviceId?: string, condition?: 'excellent' | 'good' | 'fair' | 'broken', search?: string): Promise<CompetitorPrice[]> {
    const supabase = createServerSupabaseClient()
    const pageSize = 1000
    let matchedDeviceIds: string[] | null = null

    if (search && !deviceId) {
      const s = sanitizeSearchInput(search)
      if (s) {
        const { data: devices } = await supabase
          .from('device_catalog')
          .select('id')
          .eq('is_active', true)
          .or(`make.ilike.%${s}%,model.ilike.%${s}%`)
        matchedDeviceIds = (devices || []).map(d => d.id)
        if (matchedDeviceIds.length === 0) {
          return []
        }
      }
    }

    const rows: CompetitorPrice[] = []

    for (let page = 0; ; page++) {
      let query = supabase
        .from('competitor_prices')
        .select('*, device:device_catalog(*)')
        .order('updated_at', { ascending: false })
        .range(page * pageSize, ((page + 1) * pageSize) - 1)

      if (deviceId) {
        query = query.eq('device_id', deviceId)
      }

      if (condition) {
        query = query.eq('condition', condition)
      }

      if (matchedDeviceIds) {
        if (matchedDeviceIds.length > 0) {
          query = query.in('device_id', matchedDeviceIds)
        } else {
          return []
        }
      }

      const { data, error } = await query
      if (error) throw new Error(error.message)

      const batch = (data || []) as CompetitorPrice[]
      rows.push(...batch)

      if (batch.length < pageSize) {
        break
      }
    }

    rows.sort((left, right) => {
      const leftDevice = `${left.device?.make || ''} ${left.device?.model || ''}`.trim()
      const rightDevice = `${right.device?.make || ''} ${right.device?.model || ''}`.trim()
      const deviceCompare = leftDevice.localeCompare(rightDevice)
      if (deviceCompare !== 0) return deviceCompare

      const storageCompare = (left.storage || '').localeCompare(right.storage || '')
      if (storageCompare !== 0) return storageCompare

      const conditionCompare = this.conditionOrder(left.condition) - this.conditionOrder(right.condition)
      if (conditionCompare !== 0) return conditionCompare

      const competitorCompare = (left.competitor_name || '').localeCompare(right.competitor_name || '')
      if (competitorCompare !== 0) return competitorCompare

      return (right.updated_at || '').localeCompare(left.updated_at || '')
    })

    return rows
  }

  static async createCompetitorPrice(input: Omit<CompetitorPrice, 'id' | 'created_at' | 'updated_at' | 'device'>): Promise<CompetitorPrice> {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('competitor_prices')
      .insert({
        ...input,
        condition: input.condition || 'good',
      })
      .select('*, device:device_catalog(*)')
      .single()

    if (error) throw new Error(error.message)
    return data as CompetitorPrice
  }

  static async updateCompetitorPrice(id: string, input: Partial<CompetitorPrice>): Promise<CompetitorPrice> {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('competitor_prices')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*, device:device_catalog(*)')
      .single()

    if (error) throw new Error(error.message)
    return data as CompetitorPrice
  }

  static async deleteCompetitorPrice(id: string): Promise<void> {
    const supabase = createServerSupabaseClient()
    const { error } = await supabase.from('competitor_prices').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  /**
   * Bulk upsert international competitor prices.
   * Uses device_id + storage + competitor_name as the conflict key.
   */
  static async bulkUpsertCompetitorPrices(
    rows: Array<{ device_id: string; storage: string; trade_in_price?: number; sell_price?: number }>
  ): Promise<{ imported: number; errors: string[] }> {
    const supabase = createServerSupabaseClient()
    const errors: string[] = []
    let imported = 0

    // Process in batches of 50 to avoid payload limits
    const batchSize = 50
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize).map(row => ({
        device_id: row.device_id,
        storage: row.storage,
        competitor_name: 'International',
        source: 'international_upload' as const,
        condition: 'good' as const,
        trade_in_price: row.trade_in_price ?? null,
        sell_price: row.sell_price ?? null,
        updated_at: new Date().toISOString(),
      }))

      const { error } = await supabase
        .from('competitor_prices')
        .upsert(batch, { onConflict: 'device_id,storage,competitor_name' })

      if (error) {
        errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${error.message}`)
      } else {
        imported += batch.length
      }
    }

    return { imported, errors }
  }

  // ============================================================================
  // V1: ORIGINAL COST-PLUS PRICING (Backward Compatible)
  // ============================================================================

  static async calculatePrice(input: PriceCalculationInput): Promise<PriceCalculationResult> {
    const supabase = createServerSupabaseClient()
    const deviceId = input.device_id || input.device_catalog_id

    try {
      const { data: pricingEntry, error: pricingError } = await supabase
        .from('pricing_tables')
        .select('*')
        .eq('device_id', deviceId)
        .eq('storage', input.storage || '')
        .eq('condition', 'new')
        .eq('carrier', input.carrier || 'Unlocked')
        .lte('effective_date', new Date().toISOString())
        .order('effective_date', { ascending: false })
        .limit(1)
        .single()

      if (pricingError || !pricingEntry) {
        return {
          success: false,
          final_price: 0,
          breakdown: {} as PriceCalculationResult['breakdown'],
          confidence: 0,
          price_date: new Date().toISOString(),
          valid_for_hours: 0,
          error: 'Device not found in pricing table',
        }
      }

      let calculatedPrice = pricingEntry.base_price
      const conditionMultiplier = CONDITION_MULTIPLIERS[input.condition] || 1.0
      const afterCondition = calculatedPrice * conditionMultiplier
      calculatedPrice = afterCondition

      const issuesApplied: string[] = []
      const deductionKeys = mapIssuesToDeductionKeys(input.issues || [])
      if (deductionKeys.length > 0) {
        for (const issue of deductionKeys) {
          const deduction = FUNCTIONAL_DEDUCTIONS[issue]
          if (deduction) {
            issuesApplied.push(issue)
            if (deduction.type === 'percentage') {
              calculatedPrice = calculatedPrice * (1 - deduction.value / 100)
            } else {
              calculatedPrice = calculatedPrice - deduction.value
            }
          }
        }
      }

      const { data: historicalData } = await supabase
        .from('sales_history')
        .select('sold_price')
        .eq('device_id', deviceId)
        .eq('storage', input.storage || '')
        .eq('condition', input.condition)
        .gte('sold_date', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .limit(10)

      let historicalAvg: number | null = null
      if (historicalData && historicalData.length >= 3) {
        historicalAvg = historicalData.reduce((sum, d) => sum + d.sold_price, 0) / historicalData.length
        calculatedPrice = (calculatedPrice * 0.7) + (historicalAvg * 0.3)
      }

      const marginSettings = await this.getMarginSettings()

      let finalPrice = calculatedPrice
      let costsOrMarkup: number | string = 0
      let profitOrMargin: number | string = 0

      if (input.purpose === 'buy') {
        const costs = {
          testing: marginSettings.testing_cost,
          inbound_shipping: marginSettings.inbound_shipping_cost,
          outbound_shipping: marginSettings.outbound_shipping_cost,
          marketplace_fees: calculatedPrice * (marginSettings.marketplace_fee_percent / 100),
          return_risk: calculatedPrice * (marginSettings.return_risk_percent / 100),
          processing: marginSettings.processing_cost,
        }
        const totalCosts = Object.values(costs).reduce((a, b) => a + b, 0)
        const profitTarget = Math.max(
          calculatedPrice * (marginSettings.trade_in_profit_percent / 100),
          marginSettings.trade_in_min_profit
        )
        finalPrice = calculatedPrice - totalCosts - profitTarget
        costsOrMarkup = totalCosts
        profitOrMargin = profitTarget
      } else {
        const markupPercent = marginSettings.cpo_markup_percent
        finalPrice = calculatedPrice * (1 + markupPercent / 100)
        costsOrMarkup = `${markupPercent}%`
        profitOrMargin = 'included in markup'
      }

      finalPrice = finalPrice * (input.quantity || 1)

      const confidence = this.calculateConfidence(
        !!pricingEntry,
        historicalData?.length || 0,
        false
      )

      return {
        success: true,
        final_price: round2(finalPrice),
        breakdown: {
          base_price: pricingEntry.base_price,
          condition_grade: input.condition,
          condition_multiplier: conditionMultiplier,
          after_condition: afterCondition,
          issues_applied: issuesApplied,
          after_deductions: calculatedPrice,
          historical_reference: historicalAvg,
          partner_reference: null,
          purpose: input.purpose,
          costs_or_markup: costsOrMarkup,
          profit_or_margin: profitOrMargin,
        },
        confidence,
        price_date: new Date().toISOString(),
        valid_for_hours: 24,
      }
    } catch (error) {
      return {
        success: false,
        final_price: 0,
        breakdown: {} as PriceCalculationResult['breakdown'],
        confidence: 0,
        price_date: new Date().toISOString(),
        valid_for_hours: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }

  // ============================================================================
  // SHARED HELPERS
  // ============================================================================

  static async getMarginSettings() {
    const supabase = createServerSupabaseClient()
    const { data } = await supabase
      .from('margin_settings')
      .select('*')
      .limit(1)
      .single()

    return data || DEFAULT_MARGIN_SETTINGS
  }

  private static calculateConfidence(
    hasPricingEntry: boolean,
    historicalCount: number,
    hasPartnerData: boolean
  ): number {
    let confidence = 0
    if (hasPricingEntry) confidence += 0.4
    if (historicalCount >= 3) confidence += 0.3
    else if (historicalCount >= 1) confidence += 0.15
    if (hasPartnerData) confidence += 0.3
    return Math.min(confidence, 1.0)
  }

  // ============================================================================
  // PRICING TABLE CRUD (V1 - kept for backward compatibility)
  // ============================================================================

  static async getPricingTables(deviceCatalogId?: string): Promise<PricingTable[]> {
    const supabase = createServerSupabaseClient()
    let query = supabase
      .from('pricing_tables')
      .select('*, device:device_catalog(*)')
      .order('effective_date', { ascending: false })

    if (deviceCatalogId) {
      query = query.eq('device_id', deviceCatalogId)
    }

    const { data, error } = await query
    if (error) throw new Error(error.message)
    return data as PricingTable[]
  }

  static async createPricingEntry(input: Omit<PricingTable, 'id' | 'created_at' | 'updated_at'>, userId: string): Promise<PricingTable> {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('pricing_tables')
      .insert({ ...input, created_by_id: userId })
      .select()
      .single()

    if (error) throw new Error(error.message)
    return data as PricingTable
  }

  static async updatePricingEntry(id: string, input: Partial<PricingTable>): Promise<PricingTable> {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('pricing_tables')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) throw new Error(error.message)
    return data as PricingTable
  }

  static async deletePricingEntry(id: string): Promise<void> {
    const supabase = createServerSupabaseClient()
    const { error } = await supabase.from('pricing_tables').delete().eq('id', id)
    if (error) throw new Error(error.message)
  }

  // ============================================================================
  // COMPETITOR-DRIVEN TRADE-IN PRICING
  // ============================================================================

  static async calculateTradeInFromCompetitors(input: {
    device_id: string
    storage: string
    condition: 'excellent' | 'good' | 'fair' | 'broken'
  }): Promise<{
    success: boolean
    trade_price: number
    source: 'competitor_average' | 'no_data'
    competitor_count: number
    prices: Array<{ name: string; price: number; retrieved_at?: string }>
    highest_price: number | null
    average_price: number | null
  }> {
    const supabase = createServerSupabaseClient()
    const { data } = await supabase
      .from('competitor_prices')
      .select('competitor_name, trade_in_price, retrieved_at, scraped_at, updated_at')
      .eq('device_id', input.device_id)
      .eq('storage', input.storage)
      .eq('condition', input.condition)
      .not('trade_in_price', 'is', null)
      .gt('trade_in_price', 0)

    const prices = (data || [])
      .filter(cp => cp.trade_in_price != null && cp.trade_in_price > 0)
      .map(cp => ({
        name: cp.competitor_name,
        price: cp.trade_in_price as number,
        retrieved_at: cp.retrieved_at || cp.scraped_at || cp.updated_at || undefined,
      }))

    if (prices.length === 0) {
      return { success: false, trade_price: 0, source: 'no_data', competitor_count: 0, prices: [], highest_price: null, average_price: null }
    }

    const avg = prices.reduce((s, p) => s + p.price, 0) / prices.length
    const highest = Math.max(...prices.map(p => p.price))

    return {
      success: true,
      trade_price: Math.round(avg * 100) / 100,
      source: 'competitor_average',
      competitor_count: prices.length,
      prices: prices.sort((a, b) => b.price - a.price),
      highest_price: highest,
      average_price: Math.round(avg * 100) / 100,
    }
  }
}
