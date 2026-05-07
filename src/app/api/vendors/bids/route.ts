// ============================================================================
// VENDOR BIDS API ROUTE
// GET — Fetch vendor bids for an order
// POST — Submit a new vendor bid
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { VendorService } from '@/services/vendor.service'
import { NotificationService } from '@/services/notification.service'
import { EmailService } from '@/services/email.service'
import { submitVendorBidSchema } from '@/lib/validations'
export const dynamic = 'force-dynamic'


export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role, organization_id')
      .eq('id', user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const isInternal = ['admin', 'coe_manager', 'coe_tech', 'sales'].includes(profile.role)
    const isVendor = profile.role === 'vendor'

    if (!isInternal && !isVendor) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const orderId = searchParams.get('order_id')

    if (isInternal) {
      if (orderId) {
        // Scoped to one order (existing behaviour used by order detail page)
        const bids = await VendorService.getOrderVendorBids(orderId)
        return NextResponse.json({ data: bids })
      }

      // Global bids list (used by /bids overview page)
      const status = searchParams.get('status') || undefined
      const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))
      const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('page_size') || '20', 10)))

      const serviceRole = createServiceRoleClient()
      let query = serviceRole
        .from('vendor_bids')
        .select(
          '*, vendor:vendors(id, company_name, contact_email, contact_name), order:orders(id, order_number, type, status, total_quantity)',
          { count: 'exact' }
        )
        .order('created_at', { ascending: false })

      if (status && status !== 'all') {
        query = query.eq('status', status)
      }

      const offset = (page - 1) * pageSize
      query = query.range(offset, offset + pageSize - 1)

      const { data, count, error: bidsErr } = await query
      if (bidsErr) throw new Error(bidsErr.message)

      return NextResponse.json({
        data: data || [],
        total: count || 0,
        page,
        page_size: pageSize,
        total_pages: Math.ceil((count || 0) / pageSize),
      })
    }

    // Vendor role: return only bids submitted by their own vendor record
    if (!profile.organization_id) {
      return NextResponse.json({ error: 'Vendor has no organization' }, { status: 400 })
    }

    const { data: vendor } = await supabase
      .from('vendors')
      .select('id')
      .eq('organization_id', profile.organization_id)
      .eq('is_active', true)
      .single()

    if (!vendor) {
      return NextResponse.json({ error: 'No active vendor found for your organization' }, { status: 404 })
    }

    // Step 1: fetch bids for this vendor
    let bidsQuery = supabase
      .from('vendor_bids')
      .select('*')
      .eq('vendor_id', vendor.id)
      .order('created_at', { ascending: false })

    if (orderId) {
      bidsQuery = bidsQuery.eq('order_id', orderId)
    }

    const { data: rawBids, error: bidsError } = await bidsQuery

    if (bidsError) {
      throw new Error(bidsError.message)
    }

    if (!rawBids?.length) {
      return NextResponse.json({ data: [] })
    }

    // Step 2: fetch order details separately (avoids FK join ambiguity)
    const orderIds = [...new Set(rawBids.map(b => b.order_id))]
    const { data: orders } = await supabase
      .from('orders')
      .select('id, order_number, type, status, total_quantity, created_at')
      .in('id', orderIds)

    const ordersMap = new Map((orders || []).map(o => [o.id, o]))
    const bids = rawBids.map(bid => ({
      ...bid,
      order: ordersMap.get(bid.order_id) || null,
    }))

    return NextResponse.json({ data: bids })
  } catch (error) {
    console.error('Error fetching vendor bids:', error)
    return NextResponse.json(
      { error: 'Failed to fetch vendor bids' },
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

    // Verify the user is a vendor
    const { data: profile } = await supabase
      .from('users')
      .select('role, organization_id, is_active')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'vendor') {
      return NextResponse.json({ error: 'Only vendors can submit bids' }, { status: 403 })
    }

    if (!profile.is_active) {
      return NextResponse.json({ error: 'Account is deactivated' }, { status: 403 })
    }

    if (!profile.organization_id) {
      return NextResponse.json({ error: 'Vendor has no organization' }, { status: 400 })
    }

    // Find the vendor record matching this org
    const { data: vendor } = await supabase
      .from('vendors')
      .select('id')
      .eq('organization_id', profile.organization_id)
      .eq('is_active', true)
      .single()

    if (!vendor) {
      return NextResponse.json({ error: 'No active vendor found for your organization' }, { status: 404 })
    }

    // Validate input
    const body = await request.json()
    const parsed = submitVendorBidSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      )
    }

    const serviceRole = createServiceRoleClient()
    const { data: order, error: orderError } = await serviceRole
      .from('orders')
      .select('id, order_number, type, status, total_quantity, vendor_id, parent_order_id')
      .eq('id', parsed.data.order_id)
      .single()

    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.type !== 'cpo' || order.parent_order_id) {
      return NextResponse.json(
        { error: 'Vendor bidding is available only for open CPO orders' },
        { status: 400 }
      )
    }

    if (!['submitted', 'quoted', 'accepted', 'sourcing'].includes(order.status || '')) {
      return NextResponse.json(
        { error: 'This order is not open for vendor bidding' },
        { status: 400 }
      )
    }

    if (order.vendor_id) {
      return NextResponse.json(
        { error: 'This order has already been assigned to a vendor' },
        { status: 409 }
      )
    }

    if ((order.total_quantity || 0) > 0 && parsed.data.quantity > order.total_quantity) {
      return NextResponse.json(
        { error: 'Bid quantity cannot exceed the open order quantity' },
        { status: 400 }
      )
    }

    const { data: existingBid } = await serviceRole
      .from('vendor_bids')
      .select('id, status')
      .eq('order_id', parsed.data.order_id)
      .eq('vendor_id', vendor.id)
      .in('status', ['pending', 'accepted'])
      .maybeSingle()

    if (existingBid) {
      return NextResponse.json(
        { error: 'You already have an active bid on this order' },
        { status: 409 }
      )
    }

    // Submit the bid
    const bid = await VendorService.submitBid({
      order_id: parsed.data.order_id,
      vendor_id: vendor.id,
      quantity: parsed.data.quantity,
      unit_price: parsed.data.unit_price,
      lead_time_days: parsed.data.lead_time_days,
      warranty_days: parsed.data.warranty_days,
      notes: parsed.data.notes,
    })

    // Notify all active admins + confirm to vendor (fire-and-forget)
    const orderLabel = order.order_number || parsed.data.order_id.slice(0, 8)
    const bidTitle = `New Vendor Bid — Order #${orderLabel}`
    const bidMsg = `A vendor submitted a bid for ${parsed.data.quantity} units at $${parsed.data.unit_price}/unit. Total: $${(parsed.data.quantity * parsed.data.unit_price).toFixed(2)}.`

    void (async () => {
      try {
        // Notify admins (in-app + email)
        const { data: admins } = await supabase
          .from('users')
          .select('id, email, full_name')
          .eq('role', 'admin')
          .eq('is_active', true)

        for (const admin of admins || []) {
          NotificationService.createNotification({
            user_id: admin.id,
            type: 'in_app',
            title: bidTitle,
            message: bidMsg,
            link: `/bids`,
            metadata: { audience: 'admin', order_id: parsed.data.order_id },
          }).catch((err) => console.error('Failed to notify admin:', err))

          if (admin.email) {
            EmailService.sendOrderStatusEmail({
              to: admin.email,
              recipientName: admin.full_name || 'Admin',
              orderNumber: orderLabel,
              orderId: parsed.data.order_id,
              fromStatus: 'sourcing',
              toStatus: 'Bid Received',
              subject: bidTitle,
              message: `${bidMsg} Review and respond at /bids.`,
            }).catch((err) => console.error('Failed to email admin:', err))
          }
        }

        // Confirm receipt to vendor org users (in-app + email to contact)
        const { data: vendorRecord } = await supabase
          .from('vendors')
          .select('id, contact_email, contact_name, contact_phone')
          .eq('id', vendor.id)
          .single()

        const { data: vendorOrgUsers } = await supabase
          .from('users')
          .select('id')
          .eq('organization_id', profile.organization_id)
          .eq('is_active', true)

        const vendorConfirmTitle = `Bid Submitted — Order #${orderLabel}`
        const vendorConfirmMsg = `Your bid for ${parsed.data.quantity} units at $${parsed.data.unit_price}/unit has been received and is pending admin review.`

        for (const vu of vendorOrgUsers || []) {
          NotificationService.createNotification({
            user_id: vu.id,
            type: 'in_app',
            title: vendorConfirmTitle,
            message: vendorConfirmMsg,
            link: `/vendor/bids`,
            metadata: { order_id: parsed.data.order_id, bid_id: bid.id },
          }).catch((err) => console.error('Failed to notify vendor user:', err))
        }

        if (vendorRecord?.contact_email) {
          EmailService.sendOrderStatusEmail({
            to: vendorRecord.contact_email,
            recipientName: vendorRecord.contact_name || 'Vendor',
            orderNumber: orderLabel,
            orderId: parsed.data.order_id,
            fromStatus: 'sourcing',
            toStatus: 'Bid Submitted',
            subject: vendorConfirmTitle,
            message: vendorConfirmMsg,
          }).catch((err) => console.error('Failed to email vendor confirmation:', err))
        }
      } catch (err) {
        console.error('Failed to send bid notifications:', err)
      }
    })()

    return NextResponse.json({ data: bid }, { status: 201 })
  } catch (error) {
    console.error('Error submitting vendor bid:', error)
    return NextResponse.json(
      { error: 'Failed to submit vendor bid' },
      { status: 500 }
    )
  }
}
