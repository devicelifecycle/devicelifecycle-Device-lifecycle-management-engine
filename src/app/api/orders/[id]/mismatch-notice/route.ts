import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NotificationService } from '@/services/notification.service'
import { EmailService } from '@/services/email.service'
import { AuditService } from '@/services/audit.service'
import { safeErrorMessage } from '@/lib/utils'
export const dynamic = 'force-dynamic'


export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: userProfile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!userProfile || !['admin', 'coe_manager'].includes(userProfile.role)) {
      return NextResponse.json({ error: 'Only administrators and CoE managers can send mismatch notices' }, { status: 403 })
    }

    const { data: order } = await supabase
      .from('orders')
      .select('id, order_number, created_by_id, assigned_to_id, customer_id, customer:customers(contact_email, contact_phone, company_name, organization_id)')
      .eq('id', params.id)
      .single()

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const { data: orderItems } = await supabase
      .from('order_items')
      .select('id, quantity, unit_price, claimed_condition, actual_condition, device:device_catalog(make, model)')
      .eq('order_id', params.id)

    const mismatchedItems = (orderItems || []).filter(
      (item) => item.actual_condition && item.claimed_condition && item.actual_condition !== item.claimed_condition
    )

    if (mismatchedItems.length === 0) {
      return NextResponse.json({ error: 'No mismatched items found for this order' }, { status: 400 })
    }

    const mismatchLines = mismatchedItems
      .slice(0, 12)
      .map((item) => {
        const device = item.device as { make?: string; model?: string } | null
        const label = [device?.make, device?.model].filter(Boolean).join(' ') || item.id
        const price = item.unit_price != null ? ` @ ${Number(item.unit_price).toFixed(2)}` : ''
        return `- ${label} x${item.quantity || 1}: quoted ${item.claimed_condition}, received ${item.actual_condition}${price}`
      })
      .join('\n')

    const notificationTitle = `Condition mismatch review — ${order.order_number}`
    const notificationMessage = `${mismatchedItems.length} device(s) did not match quoted condition and require quote adjustment review.`

    const internalRecipients = Array.from(new Set([order.created_by_id, order.assigned_to_id].filter(Boolean))) as string[]
    for (const recipientId of internalRecipients) {
      await NotificationService.createNotification({
        user_id: recipientId,
        type: 'in_app',
        title: notificationTitle,
        message: notificationMessage,
        link: `/orders/${order.id}`,
        metadata: {
          order_id: order.id,
          order_number: order.order_number,
          mismatched_count: mismatchedItems.length,
          sent_by: user.id,
        },
      })
    }

    let customerEmailSent = false
    const customerRecord = order.customer as { contact_email?: string; contact_phone?: string; company_name?: string; organization_id?: string } | null
    if (customerRecord?.contact_email) {
      customerEmailSent = await EmailService.sendEmail(
        customerRecord.contact_email,
        `Quote condition mismatch update — ${order.order_number}`,
        [
          `Order ${order.order_number} has condition mismatches after receiving devices.`,
          ``,
          `Mismatched devices: ${mismatchedItems.length}`,
          ``,
          `Device summary:`,
          mismatchLines || '- No line details available',
          mismatchedItems.length > 12 ? `\n...and ${mismatchedItems.length - 12} more device(s).` : '',
          ``,
          `Please review and confirm the revised quote.`,
        ].join('\n')
      )
    }

    const customerSmsSent = customerRecord?.contact_phone && EmailService.isTwilioConfigured()
      ? await EmailService.sendSMS(
          customerRecord.contact_phone,
          `[DLM] Order ${order.order_number}: ${mismatchedItems.length} device(s) need quote mismatch review. Please check your updated order details.`.slice(0, 160)
        )
      : false

    let customerInAppSentTo = 0
    if (customerRecord?.organization_id) {
      const { data: customerUsers } = await supabase
        .from('users')
        .select('id')
        .eq('organization_id', customerRecord.organization_id)
        .eq('role', 'customer')
        .eq('is_active', true)

      for (const customerUser of customerUsers || []) {
        await NotificationService.createNotification({
          user_id: customerUser.id,
          type: 'in_app',
          title: `Quote adjustment review needed — ${order.order_number}`,
          message: `${mismatchedItems.length} device(s) differed from quoted condition. Please review quote updates.`,
          link: `/orders/${order.id}`,
          metadata: {
            order_id: order.id,
            order_number: order.order_number,
            mismatched_count: mismatchedItems.length,
            audience: 'customer',
          },
        })
        customerInAppSentTo += 1
      }
    }

    await AuditService.log({
      user_id: user.id,
      action: 'price_change',
      entity_type: 'order',
      entity_id: order.id,
      old_values: {
        mismatched_items: mismatchedItems.map((item) => ({
          order_item_id: item.id,
          claimed_condition: item.claimed_condition,
        })),
      },
      new_values: {
        notice_sent: true,
      },
      metadata: {
        event: 'manual_mismatch_notice',
        order_number: order.order_number,
        mismatched_count: mismatchedItems.length,
        internal_in_app_sent_to: internalRecipients.length,
        customer_email_sent: customerEmailSent,
        customer_sms_sent: customerSmsSent,
        customer_in_app_sent_to: customerInAppSentTo,
      },
    })

    return NextResponse.json({
      success: true,
      order_id: order.id,
      order_number: order.order_number,
      mismatched_count: mismatchedItems.length,
      internal_in_app_sent_to: internalRecipients.length,
      customer_email_sent: customerEmailSent,
      customer_sms_sent: customerSmsSent,
      customer_in_app_sent_to: customerInAppSentTo,
    })
  } catch (error) {
    return NextResponse.json({ error: safeErrorMessage(error, 'Failed to send mismatch notice') }, { status: 500 })
  }
}
