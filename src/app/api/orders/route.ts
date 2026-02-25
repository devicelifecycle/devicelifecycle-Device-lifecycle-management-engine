// ============================================================================
// ORDERS API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { OrderService } from '@/services/order.service'
import { EmailService } from '@/services/email.service'
import { orderSchema } from '@/lib/validations'

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const filters = {
      status: searchParams.get('status') || undefined,
      type: searchParams.get('type') || undefined,
      customer_id: searchParams.get('customer_id') || undefined,
      vendor_id: searchParams.get('vendor_id') || undefined,
      assigned_to_id: searchParams.get('assigned_to_id') || undefined,
      search: searchParams.get('search') || undefined,
      page: Math.min(Math.max(parseInt(searchParams.get('page') || '1'), 1), 10000),
      page_size: Math.min(Math.max(parseInt(searchParams.get('page_size') || searchParams.get('limit') || '20'), 1), 100),
    }

    const result = await OrderService.getOrders(filters as Parameters<typeof OrderService.getOrders>[0])
    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching orders:', error)
    return NextResponse.json(
      { error: 'Failed to fetch orders' },
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

    // Get user's organization
    const { data: profile } = await supabase
      .from('users')
      .select('organization_id')
      .eq('id', user.id)
      .single()

    if (!profile?.organization_id) {
      return NextResponse.json({ error: 'User has no organization' }, { status: 400 })
    }

    const body = await request.json()
    
    // Validate input
    const validationResult = orderSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.errors },
        { status: 400 }
      )
    }

    const orderData = validationResult.data
    const order = await OrderService.createOrder(
      orderData as Parameters<typeof OrderService.createOrder>[0],
      user.id,
      profile.organization_id
    )

    // Send order confirmation email to customer (fire-and-forget)
    ;(async () => {
      const { data: customer } = await supabase
        .from('customers')
        .select('contact_email, contact_name')
        .eq('id', orderData.customer_id)
        .single()

      if (customer?.contact_email) {
        await EmailService.sendOrderConfirmationEmail({
          to: customer.contact_email,
          recipientName: customer.contact_name || 'Customer',
          orderNumber: order.order_number,
          orderId: order.id,
          orderType: orderData.type,
          itemCount: orderData.items.length,
        })
      }
    })().catch(err => console.error('Order confirmation email error:', err))

    return NextResponse.json(order, { status: 201 })
  } catch (error) {
    console.error('Error creating order:', error)
    return NextResponse.json(
      { error: 'Failed to create order' },
      { status: 500 }
    )
  }
}
