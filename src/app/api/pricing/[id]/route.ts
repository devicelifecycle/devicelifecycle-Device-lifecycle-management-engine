// ============================================================================
// PRICING ENTRY BY ID API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { PricingService } from '@/services/pricing.service'
import { updatePricingTableSchema } from '@/lib/validations'
export const dynamic = 'force-dynamic'


export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    if (!['admin', 'coe_manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden — admin or COE manager role required' }, { status: 403 })
    }

    const body = await request.json()
    const validationResult = updatePricingTableSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.errors },
        { status: 400 }
      )
    }
    const entry = await PricingService.updatePricingEntry((await params).id, validationResult.data)
    return NextResponse.json(entry)
  } catch (error) {
    console.error('Error updating pricing entry:', error)
    return NextResponse.json(
      { error: 'Failed to update pricing entry' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    if (!['admin', 'coe_manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden — admin or COE manager role required' }, { status: 403 })
    }

    await PricingService.deletePricingEntry((await params).id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting pricing entry:', error)
    return NextResponse.json(
      { error: 'Failed to delete pricing entry' },
      { status: 500 }
    )
  }
}
