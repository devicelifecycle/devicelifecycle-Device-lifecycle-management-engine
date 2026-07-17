// ============================================================================
// SEND TRIAGE REPORT TO CUSTOMER — mirrors send-quote-email's auth/lookup
// pattern, HTML email only (no PDF/Excel attachment yet).
// POST /api/orders/[id]/send-triage-report
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { OrderService } from '@/services/order.service'
import { TriageService } from '@/services/triage.service'
import { EmailService } from '@/services/email.service'
import { getAppPath } from '@/lib/app-url'
import { safeErrorMessage } from '@/lib/utils'
export const dynamic = 'force-dynamic'

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function formatCurrency(n?: number | null): string {
  if (n == null) return '—'
  return `$${n.toFixed(2)}`
}

function formatCondition(c?: string | null): string {
  if (!c) return '—'
  return c.charAt(0).toUpperCase() + c.slice(1).replace(/_/g, ' ')
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { profile } = auth

    if (!['admin', 'coe_manager', 'coe_tech', 'sales'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const orderId = (await params).id
    const order = await OrderService.getOrderById(orderId)
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    const customerEmail = order.customer?.contact_email
    const customerName = escapeHtml(order.customer?.contact_name || order.customer?.company_name || 'Valued Customer')
    if (!customerEmail) {
      return NextResponse.json({ error: 'No customer email on file' }, { status: 400 })
    }

    const triageResults = await TriageService.getTriageResultsForOrder(orderId)
    if (!triageResults || triageResults.length === 0) {
      return NextResponse.json({ error: 'No triage results found for this order yet' }, { status: 400 })
    }

    const safeOrderNumHtml = escapeHtml(order.order_number || '')
    const orderUrl = getAppPath(`/orders/${orderId}`)

    const rows = triageResults.map(r => {
      const imei = r.imei_record as { device?: { make?: string; model?: string } | null; claimed_condition?: string; quoted_price?: number; final_price?: number } | undefined
      const deviceLabel = imei?.device ? `${imei.device.make || ''} ${imei.device.model || ''}`.trim() : 'Device'
      const claimed = formatCondition(imei?.claimed_condition)
      const final = formatCondition(r.final_condition)
      const changed = r.condition_changed
      const adjustment = r.price_adjustment
      return `
        <tr>
          <td style="padding:6px 10px;border:1px solid #e0e0e0">${escapeHtml(deviceLabel)}</td>
          <td style="padding:6px 10px;border:1px solid #e0e0e0">${escapeHtml(claimed)}</td>
          <td style="padding:6px 10px;border:1px solid #e0e0e0${changed ? ';color:#b65d2f;font-weight:600' : ''}">${escapeHtml(final)}</td>
          <td style="padding:6px 10px;border:1px solid #e0e0e0;text-align:right${adjustment && adjustment < 0 ? ';color:#c0392b' : adjustment && adjustment > 0 ? ';color:#1e7e34' : ''}">${adjustment ? `${adjustment > 0 ? '+' : adjustment < 0 ? '-' : ''}${formatCurrency(Math.abs(adjustment))}` : '—'}</td>
        </tr>
        ${r.notes ? `<tr><td colspan="4" style="padding:4px 10px 10px;border:1px solid #e0e0e0;border-top:none;font-size:12px;color:#666;font-style:italic">${escapeHtml(r.notes)}</td></tr>` : ''}`
    }).join('')

    const anyAdjustment = triageResults.some(r => r.condition_changed || (r.price_adjustment && r.price_adjustment !== 0))

    const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
  <h2 style="color:#111">Inspection Report — Order ${safeOrderNumHtml}</h2>
  <p>Hi ${customerName},</p>
  <p>We've completed inspecting the devices for order <strong>${safeOrderNumHtml}</strong>. Here's what our team found compared to what was originally reported:</p>
  <table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:13px">
    <thead>
      <tr style="background:#f5f5f5">
        <th style="padding:6px 10px;border:1px solid #e0e0e0;text-align:left">Device</th>
        <th style="padding:6px 10px;border:1px solid #e0e0e0;text-align:left">Reported Condition</th>
        <th style="padding:6px 10px;border:1px solid #e0e0e0;text-align:left">Inspected Condition</th>
        <th style="padding:6px 10px;border:1px solid #e0e0e0;text-align:right">Price Adjustment</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  ${anyAdjustment ? `<p style="margin:8px 0;font-size:13px;color:#555">Highlighted rows reflect a condition or price change found during inspection. Your order total has been updated accordingly — log in to review.</p>` : `<p style="margin:8px 0;font-size:13px;color:#1e7e34">Good news — every device matched what was originally reported. No price changes.</p>`}
  <div style="margin:24px 0;text-align:center">
    <a href="${orderUrl}" style="display:inline-block;padding:14px 32px;background:#b65d2f;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">View Order Details</a>
  </div>
  <p style="color:#888;font-size:12px;margin-top:4px;text-align:center">Or copy this link: ${orderUrl}</p>
  <p>If you have any questions about these results, please contact our team.</p>
  <p style="color:#888;font-size:12px;margin-top:32px">— Byte-Back</p>
</div>`

    const sent = await EmailService.sendEmail(
      customerEmail,
      `Inspection Report — Order ${order.order_number}`,
      html
    )

    return NextResponse.json({ ok: true, email_sent: sent, recipient: customerEmail, devices_reported: triageResults.length })
  } catch (error) {
    console.error('Send triage report error:', error)
    return NextResponse.json({ error: safeErrorMessage(error, 'Failed to send triage report') }, { status: 500 })
  }
}
