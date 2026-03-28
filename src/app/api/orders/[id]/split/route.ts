// ============================================================================
// ORDER SPLIT API ROUTE
// POST — Execute an order split across multiple vendors
// GET  — Get split status (parent + sub-orders)
// DELETE — Undo a split
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { safeErrorMessage } from '@/lib/utils'
import { OrderSplitService } from '@/services/order-split.service'
import type { OrderSplitConfig } from '@/types'
export const dynamic = 'force-dynamic'


interface RouteParams {
  params: {
    id: string
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Role-based access control
    const { data: profile } = await supabase
      .from('users')
      .select('role, organization_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Customers cannot view split details
    if (profile.role === 'customer') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Vendors can only see splits for orders assigned to their org
    if (profile.role === 'vendor' && profile.organization_id) {
      const { data: order } = await supabase
        .from('orders')
        .select('vendor_id, vendors:vendor_id(organization_id)')
        .eq('id', params.id)
        .single()
      const vendorOrg = (order?.vendors as { organization_id?: string } | null)?.organization_id
      if (!vendorOrg || vendorOrg !== profile.organization_id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    // Internal roles (admin, coe_manager, coe_tech, sales) have full access
    const splitStatus = await OrderSplitService.getSplitStatus(params.id)
    return NextResponse.json(splitStatus)
  } catch (error) {
    console.error('Error fetching split status:', error)
    return NextResponse.json(
      { error: 'Failed to fetch split status' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only admin and coe_manager can split orders
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'coe_manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden — only admins and COE managers can split orders' }, { status: 403 })
    }

    const body = await request.json()

    // Validate request body
    if (!body.allocations || !Array.isArray(body.allocations) || body.allocations.length < 2) {
      return NextResponse.json(
        { error: 'At least 2 vendor allocations are required to split an order' },
        { status: 400 }
      )
    }

    const config: OrderSplitConfig = {
      parent_order_id: params.id,
      strategy: body.strategy || 'quantity',
      allocations: body.allocations,
      notes: body.notes,
    }

    const subOrders = await OrderSplitService.executeOrderSplit(config, user.id)

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

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only admin and coe_manager can undo splits
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'coe_manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await OrderSplitService.undoSplit(params.id, user.id)

    return NextResponse.json({ message: 'Order split has been undone' })
  } catch (error) {
    console.error('Error undoing split:', error)
    return NextResponse.json(
      { error: safeErrorMessage(error, 'Failed to undo split') },
      { status: 400 }
    )
  }
}
