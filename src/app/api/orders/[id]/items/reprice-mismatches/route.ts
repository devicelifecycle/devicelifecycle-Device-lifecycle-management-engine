import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PricingService } from '@/services/pricing.service'
import { NotificationService } from '@/services/notification.service'
import { EmailService } from '@/services/email.service'
import { AuditService } from '@/services/audit.service'
import { bulkRepriceMismatchedItemsSchema } from '@/lib/validations'
import { safeErrorMessage } from '@/lib/utils'
export const dynamic = 'force-dynamic'


function mapDeviceConditionToPricingCondition(condition?: string): 'new' | 'excellent' | 'good' | 'fair' | 'poor' {
  if (condition === 'new' || condition === 'excellent') return 'excellent'
  if (condition === 'fair') return 'fair'
  if (condition === 'broken' || condition === 'poor') return 'poor'
  return 'good'
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createServerSupabaseClient()
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
      return NextResponse.json({ error: 'Only administrators and CoE managers can bulk reprice items' }, { status: 403 })
    }

    const payload = await request.json()
    const validationResult = bulkRepriceMismatchedItemsSchema.safeParse(payload)
    if (!validationResult.success) {
      const firstError = validationResult.error.errors[0]
      return NextResponse.json({ error: firstError?.message || 'Validation failed' }, { status: 400 })
    }

    const { items, risk_mode, beat_competitor_percent, trade_in_profit_percent } = validationResult.data
    const itemIds = items.map((item) => item.order_item_id)
    const conditionByItemId = new Map(items.map((item) => [item.order_item_id, item.actual_condition]))
    const imeiRecordByItemId = new Map(items.map((item) => [item.order_item_id, item.imei_record_id]))

    const { data: order } = await supabase
      .from('orders')
      .select('id, order_number, created_by_id, assigned_to_id, customer_id, customer:customers(contact_email, contact_phone, company_name, organization_id)')
      .eq('id', params.id)
      .single()

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const { data: orderItems, error: itemError } = await supabase
      .from('order_items')
      .select('id, device_id, quantity, storage, claimed_condition, actual_condition')
      .eq('order_id', params.id)
      .in('id', itemIds)

    if (itemError) {
      return NextResponse.json({ error: itemError.message }, { status: 500 })
    }

    if (!orderItems || orderItems.length === 0) {
      return NextResponse.json({ error: 'No matching order items found for this order' }, { status: 404 })
    }

    const recommendations: Array<{
      order_item_id: string
      claimed_condition: string
      actual_condition: string
      recommended_unit_price: number
      quantity: number
      total_recommended_price: number
      imei_record_id?: string
      confidence?: number
      margin_tier?: string
      channel_decision?: string
    }> = []

    const failures: Array<{ order_item_id: string; reason: string }> = []

    for (const item of orderItems) {
      if (!item.device_id) {
        failures.push({ order_item_id: item.id, reason: 'Missing device_id' })
        continue
      }

      const requestedActualCondition = conditionByItemId.get(item.id)
      if (!requestedActualCondition) {
        failures.push({ order_item_id: item.id, reason: 'Missing actual condition in request' })
        continue
      }

      const pricingCondition = mapDeviceConditionToPricingCondition(requestedActualCondition)
      const quantity = item.quantity || 1

      const calc = await PricingService.calculatePriceV2({
        device_id: item.device_id,
        storage: item.storage || '128GB',
        carrier: 'Unlocked',
        condition: pricingCondition,
        risk_mode,
        quantity,
        ...(beat_competitor_percent != null ? { beat_competitor_percent } : {}),
        ...(trade_in_profit_percent != null ? { trade_in_profit_percent } : {}),
      })

      if (!calc.success || calc.trade_price == null) {
        failures.push({ order_item_id: item.id, reason: calc.error || 'Failed to calculate recommendation' })
        continue
      }

      const unitPrice = Math.round((calc.trade_price / quantity) * 100) / 100
      recommendations.push({
        order_item_id: item.id,
        claimed_condition: item.claimed_condition || 'good',
        actual_condition: requestedActualCondition,
        recommended_unit_price: unitPrice,
        quantity,
        total_recommended_price: Math.round(calc.trade_price * 100) / 100,
        imei_record_id: imeiRecordByItemId.get(item.id),
        confidence: calc.confidence,
        margin_tier: calc.channel_decision?.margin_tier,
        channel_decision: calc.channel_decision?.recommended_channel,
      })

      await supabase
        .from('order_items')
        .update({ actual_condition: requestedActualCondition, updated_at: new Date().toISOString() })
        .eq('id', item.id)
        .eq('order_id', params.id)
    }

    const mismatchedCount = recommendations.filter((r) => r.claimed_condition !== r.actual_condition).length
    const notificationTitle = `Condition mismatch detected on order ${order.order_number}`
    const notificationMessage = `${mismatchedCount} device(s) were received in a different condition than quoted. Pricing recommendations were generated for review.`
    const mismatchLines = recommendations
      .slice(0, 10)
      .map((r) => `- Item ${r.order_item_id}: quoted ${r.claimed_condition}, received ${r.actual_condition}, recommended ${r.recommended_unit_price.toFixed(2)}`)
      .join('\n')
    const customerEmailBody = [
      `Order ${order.order_number} has condition mismatches after receiving devices.`,
      ``,
      `Mismatched devices: ${mismatchedCount}`,
      ``,
      `Recommended repricing summary:`,
      mismatchLines || '- No line details available',
      recommendations.length > 10 ? `\n...and ${recommendations.length - 10} more device(s).` : '',
      ``,
      `Please review this order for final quote adjustment.`,
    ].join('\n')

    const recipientIds = Array.from(new Set([order.created_by_id, order.assigned_to_id].filter(Boolean))) as string[]
    for (const recipientId of recipientIds) {
      await NotificationService.createNotification({
        user_id: recipientId,
        type: 'in_app',
        title: notificationTitle,
        message: notificationMessage,
        link: `/orders/${order.id}`,
        metadata: {
          order_id: order.id,
          order_number: order.order_number,
          mismatched_count: mismatchedCount,
          reviewed_by: user.id,
          recommendations: recommendations.map((r) => ({
            order_item_id: r.order_item_id,
            claimed_condition: r.claimed_condition,
            actual_condition: r.actual_condition,
            recommended_unit_price: r.recommended_unit_price,
            imei_record_id: r.imei_record_id,
          })),
        },
      })
    }

    let customerEmailSent = false
    const customerRecord = order.customer as { contact_email?: string; contact_phone?: string; company_name?: string; organization_id?: string } | null
    const customerEmail = customerRecord?.contact_email
    if (customerEmail) {
      customerEmailSent = await EmailService.sendEmail(
        customerEmail,
        `Quote condition mismatch update — ${order.order_number}`,
        customerEmailBody
      )
    }

    const customerSmsSent = customerRecord?.contact_phone && EmailService.isTwilioConfigured()
      ? await EmailService.sendSMS(
          customerRecord.contact_phone,
          `[DLM] Order ${order.order_number}: updated mismatch pricing is ready for review on ${mismatchedCount} device(s).`.slice(0, 160)
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
          title: `Quote condition review required — ${order.order_number}`,
          message: `${mismatchedCount} device(s) did not match quoted condition. Updated recommendations are ready for review.`,
          link: `/orders/${order.id}`,
          metadata: {
            order_id: order.id,
            order_number: order.order_number,
            mismatched_count: mismatchedCount,
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
        mismatched_items: recommendations.map((r) => ({
          order_item_id: r.order_item_id,
          claimed_condition: r.claimed_condition,
        })),
      },
      new_values: {
        repriced_items: recommendations.map((r) => ({
          order_item_id: r.order_item_id,
          actual_condition: r.actual_condition,
          recommended_unit_price: r.recommended_unit_price,
        })),
      },
      metadata: {
        event: 'bulk_reprice_mismatches',
        order_number: order.order_number,
        reviewed_count: orderItems.length,
        recommendation_count: recommendations.length,
        mismatched_count: mismatchedCount,
        failed_count: failures.length,
        customer_email_sent: customerEmailSent,
        customer_sms_sent: customerSmsSent,
        customer_in_app_sent_to: customerInAppSentTo,
      },
    })

    return NextResponse.json({
      success: true,
      order_id: order.id,
      order_number: order.order_number,
      reviewed_count: orderItems.length,
      recommendation_count: recommendations.length,
      mismatched_count: mismatchedCount,
      notification_sent_to: recipientIds.length,
      customer_email_sent: customerEmailSent,
      customer_sms_sent: customerSmsSent,
      customer_in_app_sent_to: customerInAppSentTo,
      recommendations,
      failures,
    })
  } catch (error) {
    return NextResponse.json({ error: safeErrorMessage(error, 'Failed to bulk reprice mismatched devices') }, { status: 500 })
  }
}
