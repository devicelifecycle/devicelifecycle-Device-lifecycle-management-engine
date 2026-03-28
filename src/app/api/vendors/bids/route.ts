// ============================================================================
// VENDOR BIDS API ROUTE
// GET — Fetch vendor bids for an order
// POST — Submit a new vendor bid
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { VendorService } from '@/services/vendor.service'
import { NotificationService } from '@/services/notification.service'
import { submitVendorBidSchema } from '@/lib/validations'
export const dynamic = 'force-dynamic'


export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only internal roles can view vendor bids
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'coe_manager', 'coe_tech', 'sales'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const orderId = searchParams.get('order_id')

    if (!orderId) {
      return NextResponse.json({ error: 'order_id query parameter is required' }, { status: 400 })
    }

    const bids = await VendorService.getOrderVendorBids(orderId)

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
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify the user is a vendor
    const { data: profile } = await supabase
      .from('users')
      .select('role, organization_id')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'vendor') {
      return NextResponse.json({ error: 'Only vendors can submit bids' }, { status: 403 })
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

    // Notify all active admins (fire-and-forget)
    void Promise.resolve(supabase
      .from('users')
      .select('id')
      .eq('role', 'admin')
      .eq('is_active', true))
      .then(({ data: admins }) => {
        if (admins) {
          // Look up order number for the notification title
          supabase
            .from('orders')
            .select('order_number')
            .eq('id', parsed.data.order_id)
            .single()
            .then(({ data: order }) => {
              const orderLabel = order?.order_number || parsed.data.order_id.slice(0, 8)
              for (const admin of admins) {
                NotificationService.createNotification({
                  user_id: admin.id,
                  type: 'in_app',
                  title: `New Vendor Bid — Order #${orderLabel}`,
                  message: `A vendor submitted a bid for ${parsed.data.quantity} units at $${parsed.data.unit_price}/unit.`,
                  link: `/orders/${parsed.data.order_id}`,
                  metadata: { audience: 'admin', order_id: parsed.data.order_id },
                }).catch((err) => console.error('Failed to notify admin:', err))
              }
            })
        }
      })
      .catch((err: unknown) => console.error('Failed to notify admins about bid:', err))

    return NextResponse.json({ data: bid }, { status: 201 })
  } catch (error) {
    console.error('Error submitting vendor bid:', error)
    return NextResponse.json(
      { error: 'Failed to submit vendor bid' },
      { status: 500 }
    )
  }
}
