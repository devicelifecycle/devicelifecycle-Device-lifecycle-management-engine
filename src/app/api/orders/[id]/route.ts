// ============================================================================
// SINGLE ORDER API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { OrderService } from '@/services/order.service'
import { NotificationService } from '@/services/notification.service'
import { updateOrderSchema } from '@/lib/validations'
import { isValidUUID } from '@/lib/utils'
export const dynamic = 'force-dynamic'


interface RouteParams {
  params: {
    id: string
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    if (!isValidUUID(params.id)) {
      return NextResponse.json({ error: 'Invalid order ID format' }, { status: 400 })
    }
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const order = await OrderService.getOrderById(params.id)

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Fetch current user's profile for authorization
    const { data: userProfile } = await supabase
      .from('users')
      .select('role, organization_id')
      .eq('id', user.id)
      .single()

    if (!userProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 403 })
    }

    // Role-based authorization
    const { role, organization_id } = userProfile

    // Internal roles have full access
    if (role === 'admin' || role === 'coe_manager' || role === 'coe_tech') {
      return NextResponse.json(order)
    }

    // Sales can access orders they created or are assigned to (same org only)
    if (role === 'sales') {
      if (order.created_by_id === user.id || order.assigned_to_id === user.id) {
        if (organization_id && order.customer?.organization_id && order.customer.organization_id !== organization_id) {
          return NextResponse.json({ error: 'Access denied' }, { status: 403 })
        }
        return NextResponse.json(order)
      }
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Customer can only access orders for their organization
    if (role === 'customer') {
      if (order.customer?.organization_id === organization_id) {
        return NextResponse.json(order)
      }
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Vendor can only access orders for their organization — and must not see customer names
    if (role === 'vendor') {
      if (order.vendor?.organization_id === organization_id) {
        const sanitized = { ...order }
        if (sanitized.customer) {
          sanitized.customer = {
            ...sanitized.customer,
            company_name: '—',
            contact_name: '—',
            contact_email: '—',
          }
        }
        return NextResponse.json(sanitized)
      }
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Fallback - deny access
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  } catch (error) {
    console.error('Error fetching order:', error)
    return NextResponse.json(
      { error: 'Failed to fetch order' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch current user's profile for authorization
    const { data: userProfile } = await supabase
      .from('users')
      .select('role, organization_id')
      .eq('id', user.id)
      .single()

    if (!userProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 403 })
    }

    // Fetch the order for authorization check
    const order = await OrderService.getOrderById(params.id)
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Role-based authorization for updates
    const { role } = userProfile
    const canUpdate =
      role === 'admin' ||
      role === 'coe_manager' ||
      (role === 'coe_tech' && order.assigned_to_id === user.id) ||
      (role === 'sales' && (order.created_by_id === user.id || order.assigned_to_id === user.id))

    if (!canUpdate) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Sales org-boundary check on updates
    if (role === 'sales' && userProfile.organization_id && order.customer?.organization_id) {
      if (order.customer.organization_id !== userProfile.organization_id) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    const body = await request.json()
    const validationResult = updateOrderSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.errors },
        { status: 400 }
      )
    }

    // Transform null to undefined for nullable fields
    const updateData = {
      ...validationResult.data,
      vendor_id: validationResult.data.vendor_id === null ? undefined : validationResult.data.vendor_id,
      assigned_to_id: validationResult.data.assigned_to_id === null ? undefined : validationResult.data.assigned_to_id,
    }

    const updatedOrder = await OrderService.updateOrder(params.id, updateData, user.id)

    return NextResponse.json(updatedOrder)
  } catch (error) {
    console.error('Error updating order:', error)
    return NextResponse.json(
      { error: 'Failed to update order' },
      { status: 500 }
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

    // Fetch current user's profile for authorization
    const { data: userProfile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!userProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 403 })
    }

    // Only admin and coe_manager can delete orders
    if (userProfile.role !== 'admin' && userProfile.role !== 'coe_manager') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    await OrderService.deleteOrder(params.id, user.id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting order:', error)
    return NextResponse.json(
      { error: 'Failed to delete order' },
      { status: 500 }
    )
  }
}
