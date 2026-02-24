// ============================================================================
// PRICING CALCULATE API ROUTE
// Supports V1 (cost-plus) and V2 (market-referenced) pricing
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PricingService } from '@/services/pricing.service'
import { priceCalculationSchema, priceCalculationV2Schema } from '@/lib/validations'

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const version = body.version || 'v2'

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
