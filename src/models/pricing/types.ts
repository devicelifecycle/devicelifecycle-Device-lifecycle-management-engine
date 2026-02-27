// ============================================================================
// PRICING MODEL TYPES
// ============================================================================
// Models encapsulate their own pricing logic. Each model can define
// condition multipliers, deductions, margins, and formulas independently.

import type { DeviceCondition } from '@/types'

export interface PricingModelInput {
  device_id: string
  storage?: string
  carrier?: string
  condition: DeviceCondition
  issues?: string[]
  quantity?: number
  /** Base/anchor price (model may require or compute) */
  base_price?: number
  /** Purpose: trade-in (buy) or CPO (sell) */
  purpose?: 'buy' | 'sell'
}

export interface PricingModelResult {
  success: boolean
  final_price: number
  trade_price?: number
  cpo_price?: number
  confidence: number
  price_date: string
  valid_for_hours: number
  breakdown: Record<string, unknown>
  error?: string
}

/**
 * A pricing model encapsulates its own logic for calculating prices.
 * Models can be swapped per device, category, or order.
 */
export interface IPricingModel {
  /** Unique identifier */
  id: string
  /** Display name */
  name: string
  /** Short description of the model's approach */
  description: string

  /**
   * Calculate price using this model's logic.
   * @param input - Device, condition, issues, optional base price
   * @returns Result with final price and breakdown
   */
  calculate(input: PricingModelInput): Promise<PricingModelResult> | PricingModelResult
}

/** Configuration for models that use fixed margins */
export interface FixedMarginConfig {
  /** Condition multipliers: new=1.0, excellent=0.95, etc. */
  condition_multipliers: Record<DeviceCondition, number>
  /** Margin % for trade-in (buy) - applied as (anchor * condition - costs - margin) */
  trade_in_margin_percent: number
  /** Markup % for CPO (sell) - applied as anchor * (1 + markup) */
  cpo_markup_percent: number
  /** Fixed costs to subtract (testing, shipping, etc.) */
  fixed_costs_per_unit: number
}
