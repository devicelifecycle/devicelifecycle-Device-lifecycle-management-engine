// ============================================================================
// PRICING MANUAL PRICES API
// GET — Fetch last manual prices for one or more devices
// Query params: device_ids (comma-separated UUIDs)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()

    const isInternal = ['admin', 'coe_manager', 'coe_tech', 'sales'].includes(auth.profile.role)
    if (!isInternal) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const rawIds = searchParams.get('device_ids') || ''
    const deviceIds = rawIds.split(',').map(s => s.trim()).filter(Boolean)

    if (!deviceIds.length) {
      return NextResponse.json({ data: [] })
    }

    const serviceRole = createServiceRoleClient()
    const { data, error } = await serviceRole
      .from('device_last_manual_prices')
      .select('device_id, storage, condition, last_manual_price, last_set_at, last_order_id')
      .in('device_id', deviceIds)

    if (error) throw error

    return NextResponse.json({ data: data || [] })
  } catch (error) {
    console.error('Error fetching manual prices:', error)
    return NextResponse.json({ error: 'Failed to fetch manual prices' }, { status: 500 })
  }
}
