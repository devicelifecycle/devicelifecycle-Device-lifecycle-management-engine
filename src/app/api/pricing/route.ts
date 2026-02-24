// ============================================================================
// PRICING TABLES API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PricingService } from '@/services/pricing.service'
import { createPricingTableSchema } from '@/lib/validations'

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only internal roles can view pricing tables
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile && ['customer', 'vendor'].includes(profile.role)) {
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
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check admin role
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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

    const entry = await PricingService.createPricingEntry(pricingData, user.id)
    return NextResponse.json(entry, { status: 201 })
  } catch (error) {
    console.error('Error creating pricing entry:', error)
    return NextResponse.json(
      { error: 'Failed to create pricing entry' },
      { status: 500 }
    )
  }
}
