// ============================================================================
// PRICING CALCULATE API ROUTE
// Supports V1 (cost-plus), V2 (market-referenced), and model-based (data_driven)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { PricingService } from '@/services/pricing.service'
import { PricingModelRegistry } from '@/models/pricing'
import { normalizeCompetitorConditionInput, priceCalculationSchema, priceCalculationV2Schema } from '@/lib/validations'
import { checkRateLimit, getClientIp, RATE_LIMITS } from '@/lib/rate-limit'
export const dynamic = 'force-dynamic'


/** Adapt model result to V2-compatible shape for UI */
function adaptModelToV2(modelResult: { success: boolean; final_price: number; trade_price?: number; cpo_price?: number; confidence: number; breakdown: Record<string, unknown>; error?: string }, quantity: number) {
  const tradePrice = modelResult.trade_price ?? modelResult.final_price
  const cpoPrice = (modelResult.cpo_price && modelResult.cpo_price > tradePrice)
    ? modelResult.cpo_price
    : Math.round(tradePrice * 1.18 * 100) / 100
  return {
    success: modelResult.success,
    trade_price: tradePrice,
    cpo_price: cpoPrice,
    confidence: modelResult.confidence,
    quantity,
    channel_decision: {
      recommended_channel: 'marketplace' as const,
      margin_percent: 0,
      margin_tier: modelResult.confidence >= 0.8 ? 'green' as const : modelResult.confidence >= 0.6 ? 'yellow' as const : 'red' as const,
      reasoning: 'Data-driven model',
      value_add_viable: false,
    },
    breakdown: modelResult.breakdown,
    price_date: new Date().toISOString(),
    valid_for_hours: modelResult.confidence >= 0.8 ? 24 : 12,
    ...(modelResult.error && { error: modelResult.error }),
  }
}

export async function POST(request: NextRequest) {
  try {
    // Rate-limit: 60 calculate requests per minute per IP (CPU-intensive endpoint)
    const ip = getClientIp(request)
    const rl = checkRateLimit(`pricing-calculate:${ip}`, { limit: 60, windowSeconds: 60 })
    if (!rl.allowed) {
      return NextResponse.json({ error: 'Too many requests' }, {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
      })
    }

    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only internal roles can calculate pricing
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    const requesterRole = profile?.role
    if (!requesterRole || ['customer', 'vendor'].includes(requesterRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const version = body.version || 'v2'
    // If model_id is explicitly provided, use that pricing model.
    // Otherwise, route through PricingService adaptive selection so saved
    // prefer_data_driven settings are honored everywhere.
    const modelId = body.model_id || undefined

    // A/B: run all registered models in parallel and return comparison
    if (modelId === 'all') {
      const validation = priceCalculationV2Schema.safeParse(body)
      if (!validation.success) {
        return NextResponse.json(
          { error: 'Validation failed', details: validation.error.errors },
          { status: 400 }
        )
      }
      const { device_id, storage, carrier, condition, quantity, issues } = validation.data
      const allModels = PricingModelRegistry.list()
      const qty = quantity ?? 1

      const results = await Promise.allSettled(
        allModels.map(async (model) => {
          const result = await Promise.resolve(model.calculate({
            device_id,
            storage: storage ?? '128GB',
            carrier: carrier ?? 'Unlocked',
            condition,
            issues,
            quantity: qty,
            purpose: 'buy',
          }))
          return { model_id: model.id, model_name: model.name, ...adaptModelToV2(result, qty) }
        })
      )

      const comparisons = results.map((r, i) => {
        if (r.status === 'fulfilled') return r.value
        return {
          model_id: allModels[i].id,
          model_name: allModels[i].name,
          success: false,
          trade_price: 0,
          cpo_price: 0,
          confidence: 0,
          quantity: qty,
          error: r.reason instanceof Error ? r.reason.message : 'Model failed',
        }
      })

      return NextResponse.json({ ab_comparison: true, models: comparisons, quantity: qty })
    }

    if (modelId) {
      const validation = priceCalculationV2Schema.safeParse(body)
      if (!validation.success) {
        return NextResponse.json(
          { error: 'Validation failed', details: validation.error.errors },
          { status: 400 }
        )
      }
      const model = PricingModelRegistry.get(modelId)
      if (!model) {
        return NextResponse.json(
          { error: `Unknown model: ${modelId}`, available: PricingModelRegistry.list().map(m => m.id) },
          { status: 400 }
        )
      }
      const { device_id, storage, carrier, condition, quantity, issues } = validation.data
      const modelResult = await Promise.resolve(model.calculate({
        device_id,
        storage: storage ?? '128GB',
        carrier: carrier ?? 'Unlocked',
        condition,
        issues,
        quantity: quantity ?? 1,
        purpose: 'buy',
      }))
      const qty = quantity ?? 1
      return NextResponse.json(adaptModelToV2(modelResult, qty))
    }

    if (version === 'competitor_avg') {
      const { device_id, storage, condition } = body
      if (!device_id || !storage || !condition) {
        return NextResponse.json({ error: 'device_id, storage, and condition are required' }, { status: 400 })
      }
      const mappedCondition = normalizeCompetitorConditionInput(condition)
      const result = await PricingService.calculateTradeInFromCompetitors({ device_id, storage, condition: mappedCondition })
      return NextResponse.json(result)
    }

    if (!['v1', 'v2'].includes(version)) {
      return NextResponse.json({ error: 'Invalid version. Use v1, v2, or competitor_avg.' }, { status: 400 })
    }

    if (version === 'v2') {
      // V2: Market-referenced competitive pricing
      const validation = priceCalculationV2Schema.safeParse(body)
      if (!validation.success) {
        return NextResponse.json(
          { error: 'Validation failed', details: validation.error.errors },
          { status: 400 }
        )
      }

      const pricingSupabase = createServiceRoleClient()
      const result = await PricingService.calculateAdaptivePrice(
        validation.data,
        pricingSupabase
      )
      return NextResponse.json(result)
    }

    // V1: Legacy cost-plus pricing
    const validationResult = priceCalculationSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.errors },
        { status: 400 }
      )
    }

    const { device_id, condition, quantity, issues } = validationResult.data
    const pricing = await PricingService.calculatePrice({
      device_id,
      condition,
      issues,
      quantity,
    })

    const qty = quantity || 1
    const totalPrice = pricing.final_price * qty

    return NextResponse.json({
      ...pricing,
      quantity: qty,
      total_price: totalPrice,
    })
  } catch (error) {
    console.error('Error calculating pricing:', error)
    return NextResponse.json(
      { error: 'Failed to calculate pricing' },
      { status: 500 }
    )
  }
}
