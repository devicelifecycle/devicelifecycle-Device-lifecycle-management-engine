// ============================================================================
// MARKET PRICES API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PricingService } from '@/services/pricing.service'
import { createMarketPriceSchema } from '@/lib/validations'
export const dynamic = 'force-dynamic'


export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only internal roles can view market prices
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile && ['customer', 'vendor'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

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
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

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

    const entry = await PricingService.createMarketPrice(validation.data as any, user.id)
    return NextResponse.json(entry, { status: 201 })
  } catch (error) {
    console.error('Error creating market price:', error)
    return NextResponse.json({ error: 'Failed to create market price' }, { status: 500 })
  }
}
