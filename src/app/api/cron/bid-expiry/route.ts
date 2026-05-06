// ============================================================================
// BID EXPIRY CRON API ROUTE
// Runs daily — marks pending bids whose expires_at has passed as 'expired',
// notifies the vendor, and alerts all admins in-app.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { readServerEnv } from '@/lib/server-env'
import { timingSafeEqual } from 'crypto'
import { NotificationService } from '@/services/notification.service'
import { EmailService } from '@/services/email.service'
import { formatCurrency } from '@/lib/utils'
export const dynamic = 'force-dynamic'

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

type ExpiredBid = {
  id: string
  order_id: string
  vendor_id: string
  unit_price: number
  quantity: number
  expires_at: string
  vendor: {
    contact_email: string | null
    contact_name: string | null
    contact_phone: string | null
    company_name: string | null
    organization_id: string | null
  } | null
}

export async function GET(request: NextRequest) {
  try {
    const cronSecret = readServerEnv('CRON_SECRET')
    if (!cronSecret) {
      console.error('CRON_SECRET not set — bid expiry cron disabled')
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
    }

    const authHeader = request.headers.get('authorization') || ''
    if (!safeCompare(authHeader, `Bearer ${cronSecret}`)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const service = createServiceRoleClient()

    const { data: expiredBids, error } = await service
      .from('vendor_bids')
      .select('id, order_id, vendor_id, unit_price, quantity, expires_at, vendor:vendors(contact_email, contact_name, contact_phone, company_name, organization_id)')
      .eq('status', 'pending')
      .lt('expires_at', new Date().toISOString())

    if (error) throw error

    if (!expiredBids?.length) {
      return NextResponse.json({ success: true, expired: 0, timestamp: new Date().toISOString() })
    }

    // Mark all as expired
    await service
      .from('vendor_bids')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .in('id', expiredBids.map(b => b.id))

    // Pre-fetch all admins once
    const { data: admins } = await service
      .from('users')
      .select('id')
      .eq('role', 'admin')
      .eq('is_active', true)

    for (const bid of expiredBids as unknown as ExpiredBid[]) {
      const vendor = bid.vendor
      const { data: order } = await service.from('orders').select('order_number').eq('id', bid.order_id).single()
      const label = order?.order_number || bid.order_id.slice(0, 8)
      const bidSummary = `${bid.quantity} units at ${formatCurrency(bid.unit_price)}/unit`

      // In-app to vendor org users + email to contact
      if (vendor?.organization_id) {
        const { data: vendorUsers } = await service
          .from('users')
          .select('id')
          .eq('organization_id', vendor.organization_id)
          .eq('is_active', true)

        for (const vu of vendorUsers || []) {
          NotificationService.createNotification({
            user_id: vu.id,
            type: 'in_app',
            title: `Bid Expired — Order #${label}`,
            message: `Your bid (${bidSummary}) for order #${label} has expired without a decision. Submit a new bid if the order is still open.`,
            link: `/vendor/orders`,
            metadata: { bid_id: bid.id, order_id: bid.order_id },
          }).catch(() => {})
        }
      }

      if (vendor?.contact_email) {
        EmailService.sendOrderStatusEmail({
          to: vendor.contact_email,
          recipientName: vendor.contact_name || vendor.company_name || 'Vendor',
          orderNumber: label,
          orderId: bid.order_id,
          fromStatus: 'pending',
          toStatus: 'Bid Expired',
          subject: `Bid Expired — Order #${label}`,
          message: `Your bid (${bidSummary}) for order #${label} expired without a decision. If the order is still in sourcing, you may submit a new bid.`,
        }).catch(() => {})
      }

      if (vendor?.contact_phone && EmailService.isTwilioConfigured()) {
        EmailService.sendSMS(
          vendor.contact_phone,
          `[DLM] Bid Expired — Order #${label}. Your bid (${bidSummary}) has expired. Submit a new bid if the order is still open.`.slice(0, 160)
        ).catch(() => {})
      }

      // In-app alert to all admins (batched, not email to avoid noise)
      for (const admin of admins || []) {
        NotificationService.createNotification({
          user_id: admin.id,
          type: 'in_app',
          title: `Bid Expired — Order #${label}`,
          message: `${vendor?.company_name || 'A vendor'}'s bid (${bidSummary}) for order #${label} expired without a decision.`,
          link: `/bids`,
          metadata: { bid_id: bid.id, order_id: bid.order_id },
        }).catch(() => {})
      }
    }

    return NextResponse.json({
      success: true,
      expired: expiredBids.length,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Error running bid expiry cron:', error)
    return NextResponse.json({ error: 'Failed to run bid expiry check' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
