// ============================================================================
// MARKET PRICES API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { PricingService } from '@/services/pricing.service'
import { createMarketPriceSchema } from '@/lib/validations'
export const dynamic = 'force-dynamic'


export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    // Only internal roles can view market prices
    const deviceId = request.nextUrl.searchParams.get('device_id') || undefined
    const data = await PricingService.getMarketPrices(deviceId)
    return NextResponse.json({ data })
  } catch (error) {
    console.error('Error fetching market prices:', error)
    return NextResponse.json({ error: 'Failed to fetch market prices' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    if (!['admin', 'coe_manager'].includes(profile?.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const validation = createMarketPriceSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.errors },
        { status: 400 }
      )
    }

    const entry = await PricingService.createMarketPrice(validation.data as any, authUser.id)
    return NextResponse.json(entry, { status: 201 })
  } catch (error) {
    console.error('Error creating market price:', error)
    return NextResponse.json({ error: 'Failed to create market price' }, { status: 500 })
  }
}
