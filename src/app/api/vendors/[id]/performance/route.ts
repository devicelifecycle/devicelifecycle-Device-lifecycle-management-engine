// ============================================================================
// VENDOR PERFORMANCE API ROUTE
// Returns bid and fulfillment metrics for a single vendor.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { isValidUUID } from '@/lib/utils'
export const dynamic = 'force-dynamic'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!isValidUUID(id)) {
      return NextResponse.json({ error: 'Invalid vendor ID' }, { status: 400 })
    }

    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    if (!['admin', 'coe_manager', 'sales'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const service = createServiceRoleClient()

    // Bid metrics
    const { data: bids } = await service
      .from('vendor_bids')
      .select('id, status, unit_price, quantity, lead_time_days, created_at')
      .eq('vendor_id', id)

    const allBids = bids || []
    const totalBids = allBids.length
    const acceptedBids = allBids.filter(b => b.status === 'accepted').length
    const rejectedBids = allBids.filter(b => b.status === 'rejected').length
    const pendingBids = allBids.filter(b => b.status === 'pending').length
    const expiredBids = allBids.filter(b => b.status === 'expired').length
    const winRate = totalBids > 0 ? Math.round((acceptedBids / totalBids) * 100) : null

    // Average bid unit price (accepted bids with a valid price only)
    const acceptedBidPrices = allBids
      .filter(b => b.status === 'accepted' && b.unit_price != null)
      .map(b => Number(b.unit_price))
    const avgAcceptedUnitPrice = acceptedBidPrices.length > 0
      ? Math.round((acceptedBidPrices.reduce((s, p) => s + p, 0) / acceptedBidPrices.length) * 100) / 100
      : null

    // Average promised lead time (accepted bids only)
    const acceptedLeadTimes = allBids.filter(b => b.status === 'accepted' && b.lead_time_days != null).map(b => b.lead_time_days as number)
    const avgLeadTimeDays = acceptedLeadTimes.length > 0
      ? Math.round(acceptedLeadTimes.reduce((s, d) => s + d, 0) / acceptedLeadTimes.length)
      : null

    // Order fulfillment metrics
    const { data: orders } = await service
      .from('orders')
      .select('id, status, total_amount, total_quantity, accepted_at, updated_at, created_at')
      .eq('vendor_id', id)

    const allOrders = orders || []
    const totalOrders = allOrders.length
    const activeOrders = allOrders.filter(o => ['accepted', 'sourcing', 'sourced', 'shipped'].includes(o.status)).length
    const completedOrders = allOrders.filter(o => ['delivered', 'closed'].includes(o.status)).length
    const totalFulfilledValue = allOrders
      .filter(o => ['delivered', 'closed'].includes(o.status))
      .reduce((sum, o) => sum + (o.total_amount || 0), 0)
    const totalDevicesFulfilled = allOrders
      .filter(o => ['delivered', 'closed'].includes(o.status))
      .reduce((sum, o) => sum + (o.total_quantity || 0), 0)

    return NextResponse.json({
      bids: {
        total: totalBids,
        accepted: acceptedBids,
        rejected: rejectedBids,
        pending: pendingBids,
        expired: expiredBids,
        win_rate_percent: winRate,
        avg_accepted_unit_price: avgAcceptedUnitPrice,
        avg_lead_time_days: avgLeadTimeDays,
      },
      orders: {
        total: totalOrders,
        active: activeOrders,
        completed: completedOrders,
        total_fulfilled_value: totalFulfilledValue,
        total_devices_fulfilled: totalDevicesFulfilled,
      },
    })
  } catch (error) {
    console.error('Error fetching vendor performance:', error)
    return NextResponse.json({ error: 'Failed to fetch vendor performance' }, { status: 500 })
  }
}
