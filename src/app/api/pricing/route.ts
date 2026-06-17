// ============================================================================
// PRICING TABLES API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { PricingService } from '@/services/pricing.service'
import { createPricingTableSchema } from '@/lib/validations'
export const dynamic = 'force-dynamic'


export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    if (['customer', 'vendor'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const deviceId = searchParams.get('device_id') || undefined

    const pricingTables = await PricingService.getPricingTables(deviceId)
    return NextResponse.json({ data: pricingTables })
  } catch (error) {
    console.error('Error fetching pricing tables:', error)
    return NextResponse.json(
      { error: 'Failed to fetch pricing tables' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    if (!['admin', 'coe_manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden — admin or COE manager role required' }, { status: 403 })
    }

    const body = await request.json()
    const validationResult = createPricingTableSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.errors },
        { status: 400 }
      )
    }

    // Add default is_active field
    const pricingData = {
      ...validationResult.data,
      is_active: true
    }

    const entry = await PricingService.createPricingEntry(pricingData, authUser.id)
    return NextResponse.json(entry, { status: 201 })
  } catch (error) {
    console.error('Error creating pricing entry:', error)
    return NextResponse.json(
      { error: 'Failed to create pricing entry' },
      { status: 500 }
    )
  }
}
