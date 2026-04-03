// ============================================================================
// CRON: QUOTE PRICE CHANGE DETECTION + EXPIRY REMINDERS
// ============================================================================
// Runs daily. For each order in 'quoted' status (trade-in with 30-day window):
//   1. Auto-expires quotes past 30 days
//   2. Sends expiry reminders at 10 days and 5 days before expiry
//   3. Recalculates current market price for each item
//   4. If price changed by ≥ PRICE_CHANGE_NOTIFICATION_THRESHOLD %,
//      notifies the customer via email + in-app + SMS
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAppPath } from '@/lib/app-url'
import { NotificationService } from '@/services/notification.service'
import { EmailService } from '@/services/email.service'
import { PRICE_CHANGE_NOTIFICATION_THRESHOLD } from '@/lib/constants'
import { readServerEnv } from '@/lib/server-env'
import { timingSafeEqual } from 'crypto'
export const dynamic = 'force-dynamic'

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

function getServiceSupabase() {
  return createClient(
    readServerEnv('NEXT_PUBLIC_SUPABASE_URL') || '',
    readServerEnv('SUPABASE_SERVICE_ROLE_KEY') || '',
    { auth: { persistSession: false, autoRefreshToken: false } }
  )
}

export async function GET(request: NextRequest) {
  try {
    const cronSecret = readServerEnv('CRON_SECRET')

    // Verify cron secret
    if (cronSecret) {
      const authHeader = request.headers.get('authorization') || ''
      const expected = `Bearer ${cronSecret}`
      if (!safeCompare(authHeader, expected)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const supabase = getServiceSupabase()

    // Find all orders in 'quoted' status (trade-in) with items
    const { data: quotedOrders, error: ordersErr } = await supabase
      .from('orders')
      .select(`
        id, order_number, type, status, quoted_at, customer_id,
        items:order_items(id, device_id, storage, claimed_condition, unit_price, quantity,
          device:device_catalog(id, make, model))
      `)
      .eq('status', 'quoted')
      .not('quoted_at', 'is', null)

    if (ordersErr) throw ordersErr
    if (!quotedOrders || quotedOrders.length === 0) {
      return NextResponse.json({ message: 'No quoted orders to check', checked: 0 })
    }

    let priceChangeNotifications = 0
    let expiredOrders = 0
    let remindersSent = 0
    const now = new Date()
    // Reminder thresholds: check smallest first so 5d fires before 10d
    const REMINDER_DAYS_LEFT = [5, 10] as const

    for (const order of quotedOrders) {
      // Check if quote has expired (30 days from quoted_at)
      const expiresAt = order.quoted_at
        ? new Date(new Date(order.quoted_at).getTime() + 30 * 24 * 60 * 60 * 1000)
        : null

      if (expiresAt && now > expiresAt) {
        // Auto-expire: move to rejected with note
        await supabase.from('orders').update({
          status: 'rejected',
          internal_notes: `Auto-expired: quote was valid for 30 days (quoted ${order.quoted_at}, expired ${expiresAt.toISOString()})`,
          updated_at: now.toISOString(),
        }).eq('id', order.id)

        // Notify customer
        if (order.customer_id) {
          await notifyCustomer(supabase, order, 'expired', 0, 0)
        }

        expiredOrders++
        continue
      }

      // ── Quote expiry reminders (10 days left, 5 days left) ──
      if (expiresAt && order.customer_id) {
        const msLeft = expiresAt.getTime() - now.getTime()
        const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000))

        for (const threshold of REMINDER_DAYS_LEFT) {
          if (daysLeft <= threshold) {
            // Dedupe: check if we already sent this reminder
            const reminderKey = `quote_reminder_${threshold}d`
            const { data: existing } = await supabase
              .from('notifications')
              .select('id')
              .eq('metadata->>order_id', order.id)
              .eq('metadata->>type', reminderKey)
              .limit(1)
              .single()

            if (!existing) {
              await notifyCustomer(supabase, order, 'reminder', 0, 0, undefined, daysLeft, threshold)
              remindersSent++
            }
            break // Only send the most urgent reminder (5 > 10)
          }
        }
      }

      // Check price changes for each item
      const items = (order.items || []) as unknown as Array<{
        id: string
        device_id: string
        storage: string
        claimed_condition: string
        unit_price: number
        quantity: number
        device: { id: string; make: string; model: string } | null
      }>

      let totalQuotedPrice = 0
      let totalCurrentPrice = 0
      const changedItems: Array<{ device: string; quotedPrice: number; currentPrice: number; changePercent: number }> = []

      for (const item of items) {
        if (!item.device_id || !item.unit_price) continue

        const quotedPrice = +item.unit_price
        totalQuotedPrice += quotedPrice * item.quantity

        // Get current competitor prices for this device+storage+condition
        const condition = item.claimed_condition || 'good'
        const { data: comps } = await supabase
          .from('competitor_prices')
          .select('trade_in_price')
          .eq('device_id', item.device_id)
          .eq('storage', item.storage || '128GB')
          .eq('condition', condition)
          .neq('competitor_name', 'Bell')
          .gt('trade_in_price', 0)

        if (!comps || comps.length === 0) continue

        const avgCurrent = comps.reduce((sum, c) => sum + (+c.trade_in_price), 0) / comps.length
        totalCurrentPrice += avgCurrent * item.quantity

        const changePercent = quotedPrice > 0
          ? ((avgCurrent - quotedPrice) / quotedPrice) * 100
          : 0

        if (Math.abs(changePercent) >= PRICE_CHANGE_NOTIFICATION_THRESHOLD) {
          const deviceName = item.device ? `${item.device.make} ${item.device.model}` : 'Unknown Device'
          changedItems.push({
            device: deviceName,
            quotedPrice,
            currentPrice: Math.round(avgCurrent * 100) / 100,
            changePercent: Math.round(changePercent * 10) / 10,
          })
        }
      }

      // If significant price changes detected, notify customer
      if (changedItems.length > 0 && order.customer_id) {
        // Dedupe: check if we already notified about price change for this order today
        const today = new Date().toISOString().split('T')[0]
        const { data: existing } = await supabase
          .from('notifications')
          .select('id')
          .eq('metadata->>order_id', order.id)
          .eq('metadata->>type', `price_change_${today}`)
          .limit(1)
          .single()

        if (!existing) {
          await notifyCustomer(supabase, order, 'price_change', totalQuotedPrice, totalCurrentPrice, changedItems)
          priceChangeNotifications++
        }
      }
    }

    return NextResponse.json({
      checked: quotedOrders.length,
      price_change_notifications: priceChangeNotifications,
      expired_orders: expiredOrders,
      reminders_sent: remindersSent,
    })
  } catch (error) {
    console.error('[quote-price-check] Error:', error)
    return NextResponse.json(
      { error: 'Failed to check quote prices' },
      { status: 500 }
    )
  }
}

async function notifyCustomer(
  supabase: ReturnType<typeof getServiceSupabase>,
  order: { id: string; order_number: string; customer_id?: string | null },
  reason: 'price_change' | 'expired' | 'reminder',
  totalQuoted: number,
  totalCurrent: number,
  changedItems?: Array<{ device: string; quotedPrice: number; currentPrice: number; changePercent: number }>,
  daysLeft?: number,
  reminderThreshold?: number,
) {
  if (!order.customer_id) return
  const orderUrl = getAppPath(`/orders/${order.id}`)

  const { data: customer } = await supabase
    .from('customers')
    .select('contact_email, contact_name, contact_phone, organization_id')
    .eq('id', order.customer_id)
    .single()

  if (!customer) return

  const today = new Date().toISOString().split('T')[0]
  const isUp = totalCurrent > totalQuoted
  const direction = isUp ? 'increased' : 'decreased'
  const diffPercent = totalQuoted > 0 ? Math.abs(((totalCurrent - totalQuoted) / totalQuoted) * 100).toFixed(1) : '0'

  // Build messages
  let title: string
  let message: string
  let emailSubject: string
  let emailBody: string
  let smsText: string

  if (reason === 'reminder') {
    const d = daysLeft ?? 0
    // Use the exact threshold bucket passed from the caller for dedup consistency
    const reminderBucket = reminderThreshold ?? (d <= 5 ? 5 : 10)
    title = `Quote Expiring Soon — Order #${order.order_number}`
    message = `Your trade-in quote for order #${order.order_number} expires in ${d} day${d === 1 ? '' : 's'}. Log in to accept or request updates before it expires.`
    emailSubject = `Action Required: Your Quote Expires in ${d} Days — Order #${order.order_number}`
    emailBody = `<h2>Your Quote Is Expiring Soon</h2>
<p>Hi${customer.contact_name ? ` ${customer.contact_name}` : ''},</p>
<p>This is a friendly reminder that your trade-in quote for order <b>#${order.order_number}</b> will expire in <b>${d} day${d === 1 ? '' : 's'}</b>.</p>
<p>After expiry, you'll need to request a new quote and market prices may have changed.</p>
<p><a href="${orderUrl}" style="display:inline-block;padding:10px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;font-weight:600">Review &amp; Accept Quote</a></p>
<p style="color:#6b7280;font-size:12px;margin-top:24px">If you have questions, reply to this email or contact our team.</p>`
    smsText = `[DLM] Your quote for order #${order.order_number} expires in ${d} days. Log in to accept before it expires.`

    // In-app + email + SMS, then return (skip the common notification block below)
    const { data: custUsers } = await supabase
      .from('users')
      .select('id')
      .eq('organization_id', customer.organization_id)
      .eq('role', 'customer')
      .eq('is_active', true)

    for (const u of custUsers || []) {
      await NotificationService.createNotification({
        user_id: u.id,
        type: 'in_app',
        title,
        message,
        link: `/orders/${order.id}`,
        metadata: {
          order_id: order.id,
          order_number: order.order_number,
          type: `quote_reminder_${reminderBucket}d`,
          days_left: d,
        },
      })
    }

    if (customer.contact_email) {
      await EmailService.sendEmail(customer.contact_email, emailSubject, emailBody)
    }

    if (customer.contact_phone && EmailService.isTwilioConfigured()) {
      await EmailService.sendSMS(customer.contact_phone, smsText.slice(0, 160))
    }

    return
  } else if (reason === 'expired') {
    title = `Quote Expired — Order #${order.order_number}`
    message = `Your trade-in quote for order #${order.order_number} has expired after 30 days. Please contact us to get a new quote.`
    emailSubject = `Quote Expired — Order #${order.order_number}`
    emailBody = `<h2>Quote Expired</h2><p>Your trade-in quote for order <b>#${order.order_number}</b> has expired after the 30-day approval window.</p><p>Market prices may have changed since the original quote. Please log in to request a new quote, or contact our team for assistance.</p>`
    smsText = `[DLM] Your quote for order #${order.order_number} has expired (30 days). Please request a new quote.`
  } else {
    title = `Price Update — Order #${order.order_number}`
    message = `Market prices have ${direction} by ~${diffPercent}% since your quote for order #${order.order_number}. Log in to review the updated pricing.`
    emailSubject = `Price Update — Order #${order.order_number}`

    let itemsHtml = ''
    if (changedItems?.length) {
      itemsHtml = '<table style="border-collapse:collapse;width:100%;margin:16px 0"><tr style="background:#f3f4f6"><th style="padding:8px;text-align:left;border:1px solid #e5e7eb">Device</th><th style="padding:8px;text-align:right;border:1px solid #e5e7eb">Quoted</th><th style="padding:8px;text-align:right;border:1px solid #e5e7eb">Current Market</th><th style="padding:8px;text-align:right;border:1px solid #e5e7eb">Change</th></tr>'
      for (const item of changedItems) {
        const color = item.changePercent > 0 ? '#16a34a' : '#dc2626'
        const arrow = item.changePercent > 0 ? '↑' : '↓'
        itemsHtml += `<tr><td style="padding:8px;border:1px solid #e5e7eb">${item.device}</td><td style="padding:8px;text-align:right;border:1px solid #e5e7eb">$${item.quotedPrice.toFixed(2)}</td><td style="padding:8px;text-align:right;border:1px solid #e5e7eb">$${item.currentPrice.toFixed(2)}</td><td style="padding:8px;text-align:right;border:1px solid #e5e7eb;color:${color}">${arrow} ${Math.abs(item.changePercent)}%</td></tr>`
      }
      itemsHtml += '</table>'
    }

    emailBody = `<h2>Price Update for Your Trade-In Quote</h2><p>Market prices have <b>${direction}</b> by approximately <b>${diffPercent}%</b> since we sent your quote for order <b>#${order.order_number}</b>.</p>${itemsHtml}<p>Your original quote is still valid. Log in to review and accept or request a requote at the new market price.</p><p style="color:#6b7280;font-size:12px">This is an automated notification from DLM Engine price monitoring.</p>`
    smsText = `[DLM] Prices ${direction} ~${diffPercent}% for order #${order.order_number}. Log in to review.`
  }

  // 1. In-app notification to all customer users (price_change: skipped — admin must trigger email manually)
  if (reason !== 'price_change') {
    const { data: custUsers } = await supabase
      .from('users')
      .select('id')
      .eq('organization_id', customer.organization_id)
      .eq('role', 'customer')
      .eq('is_active', true)

    for (const u of custUsers || []) {
      await NotificationService.createNotification({
        user_id: u.id,
        type: 'in_app',
        title,
        message,
        link: `/orders/${order.id}`,
        metadata: {
          order_id: order.id,
          order_number: order.order_number,
          type: reason === 'expired' ? 'quote_expired' : `price_change_${today}`,
        },
      })
    }

    // 2. Email (only for non-price_change reasons — price change emails are admin-triggered)
    if (customer.contact_email) {
      await EmailService.sendEmail(customer.contact_email, emailSubject, emailBody)
    }

    // 3. SMS (Twilio only, non-price_change)
    if (customer.contact_phone && EmailService.isTwilioConfigured()) {
      await EmailService.sendSMS(customer.contact_phone, smsText.slice(0, 160))
    }
  }

  // 4. Notify admins about price change (always — so they can manually trigger customer email)
  if (reason === 'price_change') {
    const { data: admins } = await supabase
      .from('users')
      .select('id')
      .eq('role', 'admin')
      .eq('is_active', true)

    for (const admin of admins || []) {
      await NotificationService.createNotification({
        user_id: admin.id,
        type: 'in_app',
        title: `Price Change Alert — ${order.order_number}`,
        message: `Market prices ${direction} ~${diffPercent}% for quoted order #${order.order_number}. Use the order page to notify the customer.`,
        link: `/orders/${order.id}`,
        metadata: {
          order_id: order.id,
          order_number: order.order_number,
          type: `admin_price_change_${today}`,
        },
      })
    }
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
