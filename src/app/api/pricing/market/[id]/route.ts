// ============================================================================
// MARKET PRICE BY ID API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PricingService } from '@/services/pricing.service'
import { updateMarketPriceSchema } from '@/lib/validations'

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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
    const validation = updateMarketPriceSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.errors },
        { status: 400 }
      )
    }

    const entry = await PricingService.updateMarketPrice(params.id, validation.data as any, user.id)
    return NextResponse.json(entry)
  } catch (error) {
    console.error('Error updating market price:', error)
    return NextResponse.json({ error: 'Failed to update market price' }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
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

    await PricingService.deleteMarketPrice(params.id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting market price:', error)
    return NextResponse.json({ error: 'Failed to delete market price' }, { status: 500 })
  }
}
