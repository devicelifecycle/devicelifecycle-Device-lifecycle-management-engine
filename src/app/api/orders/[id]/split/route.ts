// ============================================================================
// ORDER SPLIT API ROUTE
// POST — Execute an order split across multiple vendors
// GET  — Get split status (parent + sub-orders)
// DELETE — Undo a split
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { safeErrorMessage } from '@/lib/utils'
import { OrderSplitService } from '@/services/order-split.service'
import type { OrderSplitConfig } from '@/types'
export const dynamic = 'force-dynamic'


export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    // Role-based access control
    // Customers cannot view split details
    if (profile.role === 'customer') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Vendors can only see splits for orders assigned to their org
    if (profile.role === 'vendor' && profile.organization_id) {
      const { data: order } = await supabase
        .from('orders')
        .select('vendor_id, vendors:vendor_id(organization_id)')
        .eq('id', (await params).id)
        .single()
      const vendorOrg = (order?.vendors as { organization_id?: string } | null)?.organization_id
      if (!vendorOrg || vendorOrg !== profile.organization_id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    // Internal roles (admin, coe_manager, coe_tech, sales) have full access
    const splitStatus = await OrderSplitService.getSplitStatus((await params).id)
    return NextResponse.json(splitStatus)
  } catch (error) {
    console.error('Error fetching split status:', error)
    return NextResponse.json(
      { error: 'Failed to fetch split status' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    // Only admin and coe_manager can split orders
    const body = await request.json()

    // Validate request body
    if (!body.allocations || !Array.isArray(body.allocations) || body.allocations.length < 2) {
      return NextResponse.json(
        { error: 'At least 2 vendor allocations are required to split an order' },
        { status: 400 }
      )
    }

    const config: OrderSplitConfig = {
      parent_order_id: (await params).id,
      strategy: body.strategy || 'quantity',
      allocations: body.allocations,
      notes: body.notes,
    }

    const subOrders = await OrderSplitService.executeOrderSplit(config, authUser.id)

    return NextResponse.json({
      message: `Order split into ${subOrders.length} sub-orders`,
      sub_orders: subOrders,
    })
  } catch (error) {
    console.error('Error splitting order:', error)
    return NextResponse.json(
      { error: safeErrorMessage(error, 'Failed to split order') },
      { status: 400 }
    )
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    // Only admin and coe_manager can undo splits
    await OrderSplitService.undoSplit((await params).id, authUser.id)

    return NextResponse.json({ message: 'Order split has been undone' })
  } catch (error) {
    console.error('Error undoing split:', error)
    return NextResponse.json(
      { error: safeErrorMessage(error, 'Failed to undo split') },
      { status: 400 }
    )
  }
}
