import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { EmailService } from '@/services/email.service'
import { AuditService } from '@/services/audit.service'
import { safeErrorMessage } from '@/lib/utils'
export const dynamic = 'force-dynamic'

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    if (!['admin', 'coe_manager', 'sales'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden — admin, COE manager, or sales role required' }, { status: 403 })
    }

    const orderId = (await params).id

    const { data: order } = await supabase
      .from('orders')
      .select('id, order_number, status, customer_id, customer:customers(contact_email, contact_name, company_name)')
      .eq('id', orderId)
      .single()

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    if (order.status !== 'quoted') {
      return NextResponse.json({ error: 'Price change notifications can only be sent for quoted orders' }, { status: 400 })
    }

    const customerRecord = order.customer as { contact_email?: string; contact_name?: string; company_name?: string } | null
    const customerEmail = customerRecord?.contact_email
    const customerName = customerRecord?.contact_name || customerRecord?.company_name || 'valued customer'

    if (!customerEmail) {
      return NextResponse.json({ error: 'No contact email found for this customer' }, { status: 400 })
    }

    const subject = `Updated quote for order ${order.order_number}`
    const body = `<p>Hi ${customerName},</p>
<p>The pricing for your order <b>${order.order_number}</b> has been updated. Please log in to review and accept or decline the new quote.</p>
<p>If you have any questions, please don't hesitate to reach out to our team.</p>
<p style="color:#6b7280;font-size:12px;margin-top:24px">This message was sent by your account team at DLM Engine.</p>`

    const sent = await EmailService.sendEmail(customerEmail, subject, body)

    await AuditService.log({
      user_id: authUser.id,
      action: 'price_change',
      entity_type: 'order',
      entity_id: order.id,
      old_values: {},
      new_values: { price_change_notification_sent: true },
      metadata: {
        event: 'manual_price_change_notification',
        order_number: order.order_number,
        customer_email: customerEmail,
        email_sent: sent,
      },
    })

    return NextResponse.json({ ok: true, email_sent: sent })
  } catch (error) {
    return NextResponse.json({ error: safeErrorMessage(error, 'Failed to send price change notification') }, { status: 500 })
  }
}
