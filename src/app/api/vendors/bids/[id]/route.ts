// ============================================================================
// VENDOR BID STATUS API ROUTE
// PATCH — Accept or reject a vendor bid
// When accepting:
//   1. Applies CPO markup to get customer price
//   2. Auto-transitions order to 'quoted'
//   3. Sends TWO quotes: one to vendor (bid accepted), one to customer (marked-up quote)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { VendorService } from '@/services/vendor.service'
import { NotificationService } from '@/services/notification.service'
import { OrderService } from '@/services/order.service'
import { EmailService } from '@/services/email.service'
import { safeErrorMessage, formatCurrency } from '@/lib/utils'
export const dynamic = 'force-dynamic'


export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Only admin and coe_manager can accept/reject bids
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'coe_manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { status, cpo_markup_percent } = body

    if (!status || !['accepted', 'rejected'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be "accepted" or "rejected".' },
        { status: 400 }
      )
    }

    const markupPercent = cpo_markup_percent != null ? Number(cpo_markup_percent) : undefined

    const updatedBid = await VendorService.updateBidStatus(
      params.id,
      status,
      markupPercent
    )

    // Get order details for notifications
    const { data: order } = await supabase
      .from('orders')
      .select('id, order_number, status, type, customer_id, vendor_id, total_amount, quoted_amount')
      .eq('id', updatedBid.order_id)
      .single()

    const orderLabel = order?.order_number || updatedBid.order_id.slice(0, 8)

    // ──────────────────────────────────────────────────────────────
    // QUOTE 1: Notify VENDOR about bid decision (in-app + email)
    // ──────────────────────────────────────────────────────────────
    if (updatedBid.vendor_id) {
      const { data: vendor } = await supabase
        .from('vendors')
        .select('id, company_name, contact_email, contact_phone, contact_name, organization_id')
        .eq('id', updatedBid.vendor_id)
        .single()

      if (vendor?.organization_id) {
        const { data: vendorUsers } = await supabase
          .from('users')
          .select('id, email, full_name, notification_email')
          .eq('organization_id', vendor.organization_id)
          .eq('is_active', true)

        const vendorTitle = status === 'accepted'
          ? `Bid Accepted — Order #${orderLabel}`
          : `Bid Rejected — Order #${orderLabel}`
        const vendorMessage = status === 'accepted'
          ? `Your bid of ${formatCurrency(updatedBid.unit_price)}/unit for ${updatedBid.quantity} units has been accepted. Total: ${formatCurrency(updatedBid.total_price || updatedBid.unit_price * updatedBid.quantity)}.`
          : `Your bid for order #${orderLabel} has been rejected.`

        // In-app notifications
        for (const vu of vendorUsers || []) {
          NotificationService.createNotification({
            user_id: vu.id,
            type: 'in_app',
            title: vendorTitle,
            message: vendorMessage,
            link: `/vendor/orders`,
            metadata: { order_id: updatedBid.order_id, bid_id: updatedBid.id, bid_status: status },
          }).catch((err) => console.error('Failed to notify vendor user:', err))
        }

        // Email to vendor contact
        if (vendor.contact_email) {
          EmailService.sendOrderStatusEmail({
            to: vendor.contact_email,
            recipientName: vendor.contact_name || vendor.company_name || 'Vendor',
            orderNumber: orderLabel,
            orderId: updatedBid.order_id,
            fromStatus: 'sourcing',
            toStatus: status === 'accepted' ? 'Bid Accepted' : 'Bid Rejected',
            subject: vendorTitle,
            message: vendorMessage,
          }).catch((err) => console.error('Failed to email vendor:', err))
        }

        if (vendor.contact_phone && EmailService.isTwilioConfigured()) {
          EmailService.sendSMS(
            vendor.contact_phone,
            `[DLM] ${vendorTitle}. ${vendorMessage}`.slice(0, 160)
          ).catch((err) => console.error('Failed to SMS vendor:', err))
        }
      }
    }

    // ──────────────────────────────────────────────────────────────
    // QUOTE 2: If bid ACCEPTED → auto-transition order to 'quoted'
    //          and send customer their quote with marked-up pricing
    // ──────────────────────────────────────────────────────────────
    if (status === 'accepted' && order && order.status === 'sourcing') {
      try {
        // Transition order to 'quoted' — this sets quoted_at, quote_expires_at
        await OrderService.transitionOrder(order.id, 'quoted', user.id, 'Vendor bid accepted — quote generated for customer')

        // Send customer notification with marked-up quote
        const customerAmount = order.quoted_amount || order.total_amount || 0

        // Get customer info
        if (order.customer_id) {
          const { data: customer } = await supabase
            .from('customers')
            .select('contact_email, contact_phone, contact_name, company_name, organization_id')
            .eq('id', order.customer_id)
            .single()

          if (customer) {
            const custTitle = `Quote Ready — Order #${orderLabel}`
            const custMessage = `Your CPO quote for order #${orderLabel} is ready for review. Total: ${formatCurrency(customerAmount)}. You have 30 days to accept or decline.`

            // In-app to customer org users
            if (customer.organization_id) {
              const { data: custUsers } = await supabase
                .from('users')
                .select('id')
                .eq('organization_id', customer.organization_id)
                .eq('is_active', true)

              for (const cu of custUsers || []) {
                NotificationService.createNotification({
                  user_id: cu.id,
                  type: 'in_app',
                  title: custTitle,
                  message: custMessage,
                  link: `/orders/${order.id}`,
                  metadata: { order_id: order.id, order_number: orderLabel, type: 'cpo_quote_ready' },
                }).catch(() => {})
              }
            }

            // Email to customer contact
            if (customer.contact_email) {
              EmailService.sendOrderStatusEmail({
                to: customer.contact_email,
                recipientName: customer.contact_name || customer.company_name || 'Customer',
                orderNumber: orderLabel,
                orderId: order.id,
                fromStatus: 'sourcing',
                toStatus: 'quoted',
                subject: custTitle,
                message: custMessage,
              }).catch((err) => console.error('Failed to email customer:', err))
            }

            if (customer.contact_phone && EmailService.isTwilioConfigured()) {
              EmailService.sendSMS(
                customer.contact_phone,
                `[DLM] ${custTitle}. ${custMessage}`.slice(0, 160)
              ).catch((err) => console.error('Failed to SMS customer:', err))
            }
          }
        }
      } catch (err) {
        console.error('Failed to auto-transition order to quoted:', err)
        // Non-fatal — bid was still accepted, admin can manually transition
      }
    }

    return NextResponse.json({ data: updatedBid })
  } catch (error) {
    console.error('Error updating bid status:', error)
    return NextResponse.json(
      { error: safeErrorMessage(error, 'Failed to update bid status') },
      { status: 500 }
    )
  }
}
