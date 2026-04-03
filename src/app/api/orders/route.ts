// ============================================================================
// ORDERS API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { OrderService } from '@/services/order.service'
import { EmailService } from '@/services/email.service'
import { NotificationService } from '@/services/notification.service'
import { sanitizeOrdersForVendor } from '@/lib/order-visibility'
import { orderSchema, orderFiltersSchema } from '@/lib/validations'
export const dynamic = 'force-dynamic'


export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
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
      date_from: searchParams.get('date_from') || undefined,
      date_to: searchParams.get('date_to') || undefined,
      is_sla_breached: searchParams.get('is_sla_breached') ? searchParams.get('is_sla_breached') === 'true' : undefined,
      page: Math.min(Math.max(parseInt(searchParams.get('page') || '1'), 1), 10000),
      page_size: Math.min(Math.max(parseInt(searchParams.get('page_size') || searchParams.get('limit') || '20'), 1), 100),
      sort_by: searchParams.get('sort_by') || undefined,
      sort_order: searchParams.get('sort_order') || undefined,
    }

    const validated = orderFiltersSchema.safeParse(filters)
    const safeFilters = validated.success ? validated.data : { ...filters, sort_by: undefined, sort_order: undefined }

    const { data: profile } = await supabase
      .from('users')
      .select('role, organization_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 403 })
    }

    const scopedFilters = {
      ...safeFilters,
      requester_id: user.id,
      requester_role: profile?.role,
      requester_organization_id: profile?.organization_id,
    }

    const result = await OrderService.getOrders(scopedFilters as Parameters<typeof OrderService.getOrders>[0])

    // Vendors only see fulfillment-safe order data.
    if (profile?.role === 'vendor' && result.data?.length) {
      result.data = sanitizeOrdersForVendor(result.data)
    }

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
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's role and organization
    const { data: profile } = await supabase
      .from('users')
      .select('role, organization_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 403 })
    }

    if (profile.role === 'vendor') {
      return NextResponse.json(
        { error: 'Vendors cannot create orders' },
        { status: 403 }
      )
    }

    const body = await request.json()
    
    // Validate input
    const validationResult = orderSchema.safeParse(body)
    if (!validationResult.success) {
      const first = validationResult.error.errors[0]
      const msg = first?.message || 'Validation failed'
      return NextResponse.json(
        { error: msg, details: validationResult.error.errors },
        { status: 400 }
      )
    }

    let orderData = validationResult.data

    if (profile.role === 'sales' && orderData.type === 'cpo') {
      return NextResponse.json(
        { error: 'Sales can create trade-in orders only' },
        { status: 403 }
      )
    }

    // Resolve organization: user's org or customer's org (for internal users without org)
    let orgId = profile.organization_id
    const { data: customer } = await supabase
      .from('customers')
      .select('id, organization_id')
      .eq('id', orderData.customer_id)
      .single()

    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 400 })
    }

    if (profile.role === 'customer') {
      if (customer.organization_id !== profile.organization_id) {
        return NextResponse.json(
          { error: 'You can only create orders for your own organization' },
          { status: 403 }
        )
      }
      orgId = profile.organization_id ?? customer.organization_id ?? ''
    } else {
      orgId = profile.organization_id ?? customer.organization_id ?? ''
    }

    const order = await OrderService.createOrder(
      orderData as Parameters<typeof OrderService.createOrder>[0],
      user.id,
      orgId
    )

    // Send order confirmation email to customer (fire-and-forget)
    ;(async () => {
      const { data: customer } = await supabase
        .from('customers')
        .select('contact_email, contact_name, contact_phone')
        .eq('id', orderData.customer_id)
        .single()

      const orderTypeLabel = orderData.type === 'cpo' ? 'CPO' : 'Trade-In'

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

      if (customer?.contact_phone && EmailService.isTwilioConfigured()) {
        await EmailService.sendSMS(
          customer.contact_phone,
          `[DLM] Order #${order.order_number} confirmed. Your ${orderTypeLabel} order was received and is now being reviewed.`.slice(0, 160)
        )
      }
    })().catch(err => console.error('Order confirmation email error:', err))

    // Notify admins when an organization creates an order (fire-and-forget)
    ;(async () => {
      const svc = createServiceRoleClient()
      const { data: admins } = await svc.from('users').select('id').eq('role', 'admin').eq('is_active', true)
      const orderLink = `/orders/${order.id}`
      const title = `New Order #${order.order_number} Created`
      const message = `A new order #${order.order_number} has been created${order.status === 'submitted' ? ' and is awaiting pricing.' : '.'}`
      for (const admin of admins || []) {
        await NotificationService.createNotification({
          user_id: admin.id,
          type: 'in_app',
          title,
          message,
          link: orderLink,
          metadata: { order_id: order.id, order_number: order.order_number, status: order.status, audience: 'admin' },
        }).catch(() => {})
      }
    })().catch(err => console.error('Admin order notification error:', err))

    // Notify the customer org users (in-app) that their order was received (fire-and-forget)
    ;(async () => {
      if (!orderData.customer_id) return
      const svc = createServiceRoleClient()
      const { data: customerRecord } = await svc
        .from('customers')
        .select('organization_id, company_name')
        .eq('id', orderData.customer_id)
        .single()
      if (!customerRecord?.organization_id) return
      const { data: orgUsers } = await svc
        .from('users')
        .select('id')
        .eq('organization_id', customerRecord.organization_id)
        .eq('role', 'customer')
        .eq('is_active', true)
      const orderTypeLabel = orderData.type === 'cpo' ? 'CPO' : 'Trade-In'
      const customerTitle = `Order #${order.order_number} Received`
      const customerMessage = `Your ${orderTypeLabel} order has been received and is being processed. We'll notify you as soon as a quote is ready.`
      const orderLink = `/customer/orders`
      for (const orgUser of orgUsers || []) {
        await NotificationService.createNotification({
          user_id: orgUser.id,
          type: 'in_app',
          title: customerTitle,
          message: customerMessage,
          link: orderLink,
          metadata: {
            order_id: order.id,
            order_number: order.order_number,
            status: order.status,
            audience: 'customer',
            event: 'order_created',
          },
        }).catch(() => {})
      }
    })().catch(err => console.error('Customer order notification error:', err))

    return NextResponse.json(order, { status: 201 })
  } catch (error) {
    console.error('Error creating order:', error)
    const message = error instanceof Error ? error.message : 'Failed to create order'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
