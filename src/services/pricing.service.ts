// ============================================================================
// PRICING SERVICE
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  CHANNEL_DECISION_THRESHOLDS,
  MARKETPLACE_FEE_PERCENT,
  COMPETITIVE_RELEVANCE_MIN,
  BREAKAGE_RISK_PERCENT,
  OUTLIER_DEVIATION_THRESHOLD,
  BROKEN_DEVICE_MULTIPLIER,
  RISK_MODE_CONFIG,
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
  cpo_markup_percent: 25,
  cpo_enterprise_markup_percent: 18,
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

export class PricingService {

  // ============================================================================
  // V2: MARKET-REFERENCED PRICING (Primary)
  // ============================================================================

  /**
   * Calculate price using market-referenced competitive model
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
  }): Promise<PriceCalculationResultV2> {
    const supabase = createServerSupabaseClient()
    const carrier = input.carrier || 'Unlocked'

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

      // Fallback: try pricing_tables if no market_prices entry
      let anchorPrice = marketEntry?.wholesale_c_stock || 0
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
      }

      if (!anchorPrice) {
        return this.v2ErrorResult('Device not found in market prices or pricing table')
      }

      // Step 2: Apply condition multiplier
      const conditionMultiplier = CONDITION_MULTIPLIERS[input.condition] || 1.0
      const conditionAdjustment = anchorPrice * (1 - conditionMultiplier)
      let adjustedPrice = anchorPrice * conditionMultiplier

      // Step 3: Apply functional deductions
      let totalDeductions = 0
      if (input.issues && input.issues.length > 0) {
        for (const issue of input.issues) {
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

      // Step 4: Get competitor prices
      const { data: competitorData } = await supabase
        .from('competitor_prices')
        .select('*')
        .eq('device_id', input.device_id)
        .eq('storage', input.storage)

      const competitors: Array<{ name: string; price: number; gap_percent: number }> = []
      let highestCompetitor = 0

      if (competitorData && competitorData.length > 0) {
        for (const cp of competitorData) {
          const price = cp.trade_in_price || 0
          if (price > 0) {
            const gapPercent = anchorPrice > 0 ? (anchorPrice - price) / anchorPrice : 0
            competitors.push({
              name: cp.competitor_name,
              price,
              gap_percent: round2(gapPercent * 100) / 100,
            })
            if (price > highestCompetitor) highestCompetitor = price
          }
        }
      }

      // Step 5: Risk mode — enterprise has lower margin target
      const riskMode: RiskMode = input.risk_mode || 'retail'
      const marginTarget = RISK_MODE_CONFIG[riskMode].margin_percent / 100

      // Step 6: Marketplace data and D-grade formula
      const mpPrice = marketEntry?.marketplace_price || marketEntry?.marketplace_good || 0
      const mpFeeRate = MARKETPLACE_FEE_PERCENT / 100
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
      // This provides a floor/reference from the marketplace-reverse perspective
      let dGradeFormula = undefined
      if (mpPrice > 0) {
        const feeDeduction = mpPrice * mpFeeRate
        const marginDeduction = mpPrice * marginTarget
        const estimatedRepairs = avgRepairCost
        const breakageDeduction = mpPrice * (BREAKAGE_RISK_PERCENT / 100)
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

      // Step 7: Apply 5% breakage risk deduction to adjusted price
      const breakageDeduction = adjustedPrice * (BREAKAGE_RISK_PERCENT / 100)
      adjustedPrice -= breakageDeduction

      // Step 8: Determine trade price (competitive relevance)
      // Use market_prices.trade_price if set, otherwise calculate
      let tradePrice = marketEntry?.trade_price || 0
      if (!tradePrice) {
        // Ensure we're at least COMPETITIVE_RELEVANCE_MIN of highest competitor
        const competitiveFloor = highestCompetitor * COMPETITIVE_RELEVANCE_MIN
        // Also use D-grade formula as a reference floor if available
        const dGradeFloor = dGradeFormula ? dGradeFormula.calculated_trade_price : 0
        tradePrice = Math.max(adjustedPrice, competitiveFloor, dGradeFloor)
      }

      // Step 9: Calculate margin vs C-stock
      const marginPercent = safeNum(anchorPrice > 0 ? (anchorPrice - tradePrice) / anchorPrice : 0)

      // Step 10: Repair buffer
      const repairBuffer = mpNet > 0 ? mpNet - tradePrice : 0

      const suggestedRepairs: Array<{ type: string; cost: number }> = []
      if (repairBuffer > 0 && repairCosts) {
        for (const rc of repairCosts as RepairCost[]) {
          if (rc.cost <= repairBuffer) {
            suggestedRepairs.push({ type: rc.repair_type, cost: rc.cost })
          }
        }
      }

      // Step 11: Channel routing decision
      let marginTier: MarginTier
      let recommendedChannel: SalesChannel
      let reasoning: string

      if (marginPercent >= CHANNEL_DECISION_THRESHOLDS.GREEN_MIN) {
        marginTier = 'green'
        recommendedChannel = 'wholesale'
        reasoning = `${round2(marginPercent * 100)}% margin — strong. Direct wholesale viable.`
      } else if (marginPercent >= CHANNEL_DECISION_THRESHOLDS.YELLOW_MIN) {
        marginTier = 'yellow'
        recommendedChannel = mpNet > tradePrice ? 'marketplace' : 'wholesale'
        reasoning = `${round2(marginPercent * 100)}% margin — moderate. Check MP opportunity, evaluate value-add.`
      } else {
        marginTier = 'red'
        recommendedChannel = 'marketplace'
        reasoning = `${round2(marginPercent * 100)}% margin — tight. Route to marketplace.`
      }

      // Append risk mode context
      reasoning += ` [${riskMode} mode, ${RISK_MODE_CONFIG[riskMode].margin_percent}% target margin]`

      const channelDecision: ChannelDecision = {
        recommended_channel: recommendedChannel,
        margin_percent: round2(marginPercent * 100) / 100,
        margin_tier: marginTier,
        reasoning,
        marketplace_net: round2(mpNet),
        repair_buffer: round2(repairBuffer),
        value_add_viable: repairBuffer > minRepairCost,
      }

      // Step 12: CPO price
      const cpoMarkup = riskMode === 'enterprise'
        ? (DEFAULT_MARGIN_SETTINGS.cpo_enterprise_markup_percent / 100)
        : (DEFAULT_MARGIN_SETTINGS.cpo_markup_percent / 100)
      const cpoPrice = marketEntry?.cpo_price || round2(anchorPrice * (1 + cpoMarkup))

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
        const deviation = safeNum(Math.abs(tradePrice - historicalAvg) / historicalAvg)
        if (deviation > OUTLIER_DEVIATION_THRESHOLD) {
          outlierFlag = true
          outlierReason = `Trade price $${round2(tradePrice)} deviates ${round2(deviation * 100)}% from 30-day avg $${round2(historicalAvg)} (threshold: ${OUTLIER_DEVIATION_THRESHOLD * 100}%)`
        }
      }

      // Determine price source
      const priceSource = marketEntry ? 'Market Data' : 'Pricing Table'

      // Apply quantity
      const qty = input.quantity || 1

      return {
        success: true,
        trade_price: round2(tradePrice * qty),
        cpo_price: round2(cpoPrice * qty),
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
        confidence: this.calculateConfidenceV2(!!marketEntry, competitors.length, mpPrice > 0),
        price_date: new Date().toISOString(),
        valid_for_hours: 24,
        breakdown: {
          anchor_price: anchorPrice,
          condition_adjustment: round2(conditionAdjustment),
          deductions: round2(totalDeductions),
          breakage_deduction: round2(breakageDeduction),
          margin_applied: round2(marginPercent * 100),
          final_trade_price: round2(tradePrice),
          final_cpo_price: round2(cpoPrice),
        },
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

  static async getCompetitorPrices(deviceId?: string): Promise<CompetitorPrice[]> {
    const supabase = createServerSupabaseClient()
    let query = supabase
      .from('competitor_prices')
      .select('*, device:device_catalog(*)')
      .order('updated_at', { ascending: false })

    if (deviceId) {
      query = query.eq('device_id', deviceId)
    }

    const { data, error } = await query
    if (error) throw new Error(error.message)
    return (data || []) as CompetitorPrice[]
  }

  static async createCompetitorPrice(input: Omit<CompetitorPrice, 'id' | 'created_at' | 'updated_at' | 'device'>): Promise<CompetitorPrice> {
    const supabase = createServerSupabaseClient()
    const { data, error } = await supabase
      .from('competitor_prices')
      .insert(input)
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
      if (input.issues && input.issues.length > 0) {
        for (const issue of input.issues) {
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
      query = query.eq('device_catalog_id', deviceCatalogId)
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
}
