// ============================================================================
// PRICING CALCULATE API ROUTE
// Supports V1 (cost-plus), V2 (market-referenced), and model-based (data_driven)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PricingService } from '@/services/pricing.service'
import { PricingModelRegistry } from '@/models/pricing'
import { priceCalculationSchema, priceCalculationV2Schema } from '@/lib/validations'

/** Adapt model result to V2-compatible shape for UI */
function adaptModelToV2(modelResult: { success: boolean; final_price: number; trade_price?: number; cpo_price?: number; confidence: number; breakdown: Record<string, unknown>; error?: string }, quantity: number) {
  const tradePrice = modelResult.trade_price ?? modelResult.final_price
  return {
    success: modelResult.success,
    trade_price: tradePrice,
    cpo_price: modelResult.cpo_price ?? tradePrice,
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
    const supabase = createServerSupabaseClient()
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

    if (profile && ['customer', 'vendor'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const version = body.version || 'v2'
    // Prefer data_driven when setting is enabled (reduces third-party dependency)
    const settings = await PricingService.getPricingSettings()
    const preferDataDriven = (settings as unknown as Record<string, unknown>).prefer_data_driven === true || (settings as unknown as Record<string, unknown>).prefer_data_driven === 'true'
    const modelId = body.model_id ?? (preferDataDriven ? 'data_driven' : undefined)

    // model_id: use pricing model (e.g. data_driven) instead of PricingService
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

    if (!['v1', 'v2'].includes(version)) {
      return NextResponse.json({ error: 'Invalid version. Use v1 or v2.' }, { status: 400 })
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

      const result = await PricingService.calculatePriceV2(validation.data)
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
