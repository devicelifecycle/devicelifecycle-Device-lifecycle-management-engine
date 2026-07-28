// ============================================================================
// SEND QUOTE DIRECTLY TO CUSTOMER — PDF + Excel attachments
// POST /api/orders/[id]/send-quote-email
// ============================================================================

import { NextRequest, NextResponse, after } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { OrderService } from '@/services/order.service'
import { EmailService } from '@/services/email.service'
import { generateOrderPDF, buildPriceAdjustmentNote } from '@/lib/pdf'
import { computeOrderTaxLine } from '@/lib/tax'
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

function formatDate(s?: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })
}

async function buildExcelBuffer(order: Awaited<ReturnType<typeof OrderService.getOrderById>>, fallbackValidityDays = 30): Promise<Buffer> {
  const ExcelJS = await import('exceljs')
  const isQuote = !['payment_processing', 'payment_sent', 'closed'].includes(order!.status)
  const docType = isQuote ? 'Quote' : 'Invoice'
  const quoteValidityDays = (order!.quote_expires_at && order!.quoted_at)
    ? Math.max(1, Math.round((new Date(order!.quote_expires_at).getTime() - new Date(order!.quoted_at).getTime()) / (1000 * 60 * 60 * 24)))
    : fallbackValidityDays
  const wb = new ExcelJS.default.Workbook()

  // Summary sheet
  const ws1 = wb.addWorksheet('Summary')
  ws1.columns = [{ width: 20 }, { width: 40 }]
  const summaryData: (string | number | null | undefined)[][] = [
    ['Byte-Back — ' + docType],
    [],
    ['Order Number', order!.order_number],
    ['Type', (order!.type || '').replace(/_/g, ' ').toUpperCase()],
    ['Date', formatDate(order!.created_at)],
    ['Quoted Date', formatDate(order!.quoted_at)],
    [],
    ['Customer', order!.customer?.company_name || '—'],
    ['Contact', order!.customer?.contact_name || '—'],
    ['Email', order!.customer?.contact_email || '—'],
    ['Phone', order!.customer?.contact_phone || '—'],
    [],
    ['Total Quantity', order!.total_quantity ?? '—'],
    ['Quoted Amount', formatCurrency(order!.quoted_amount ?? order!.total_amount)],
    ['Final Amount', formatCurrency(order!.final_amount)],
    ...((() => {
      const t = computeOrderTaxLine({ type: order!.type, subtotal: order!.final_amount || order!.quoted_amount || order!.total_amount, billingAddress: order!.customer?.billing_address })
      return t
        ? [['Subtotal', formatCurrency(t.subtotal)], [t.label, formatCurrency(t.taxAmount)], ['Total (incl. tax)', formatCurrency(t.total)]] as (string | number | null | undefined)[][]
        : []
    })()),
    ...(isQuote ? [['Quote Valid Until', order!.quote_expires_at ? formatDate(order!.quote_expires_at) : `${quoteValidityDays} days from quote date`]] as (string | number | null | undefined)[][] : []),
    ...(order!.notes ? [[], ['Notes', order!.notes]] as (string | number | null | undefined)[][] : []),
  ]
  summaryData.forEach(row => ws1.addRow(row))

  // Line Items sheet
  const ws2 = wb.addWorksheet('Line Items')
  ws2.columns = [
    { width: 30 }, { width: 10 }, { width: 12 }, { width: 10 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 50 },
  ]
  ws2.addRow(['Device', 'Storage', 'Condition', 'Quantity', 'Unit Price', 'Total', 'Actual Condition', 'Adjustment Reason'])
  for (const item of order!.items || []) {
    const rawLabel = item.device ? `${item.device.make || ''} ${item.device.model || ''}`.trim() : ''
    const deviceFromNotes = !rawLabel && item.notes
      ? (item.notes.match(/^\[Device: ([^\]]+)\]/) || [])[1] || ''
      : ''
    const device = rawLabel || deviceFromNotes || 'Unknown Device'
    const qty = item.quantity ?? 1
    const unit = item.unit_price ?? item.guaranteed_buyback_price ?? 0
    const total = unit * qty
    const adjustmentNote = buildPriceAdjustmentNote(item)
    ws2.addRow([
      device,
      item.storage || '—',
      (item.claimed_condition || '—').replace(/_/g, ' '),
      qty,
      unit > 0 ? unit : '—',
      total > 0 ? total : '—',
      adjustmentNote ? (item.actual_condition || '—').replace(/_/g, ' ') : '—',
      adjustmentNote || '—',
    ])
  }

  const arrayBuffer = await wb.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { profile, effectiveRole } = auth

    if (!['admin', 'coe_manager', 'sales'].includes(effectiveRole)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json().catch(() => ({}))
    const bodyValidityDays: number = typeof body?.validity_days === 'number' ? Math.max(1, Math.min(365, body.validity_days)) : 30

    const orderId = (await params).id
    const order = await OrderService.getOrderById(orderId)
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    const customerEmail = order.customer?.contact_email
    const customerName = escapeHtml(order.customer?.contact_name || order.customer?.company_name || 'Valued Customer')
    if (!customerEmail) {
      return NextResponse.json({ error: 'No customer email on file' }, { status: 400 })
    }

    const isQuote = !['payment_processing', 'payment_sent', 'closed'].includes(order.status)
    const docType = isQuote ? 'Quote' : 'Invoice'
    const safeOrderNum = (order.order_number || '').replace(/[^a-zA-Z0-9._-]/g, '_')
    const filenameBase = `${safeOrderNum}-${docType}`

    // Derive URL before scheduling background work (not available inside after())
    const envSiteUrl = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '')
    const requestOrigin = `${req.nextUrl.protocol}//${req.nextUrl.host}`
    const siteUrl = envSiteUrl || requestOrigin

    // Schedule the heavy work (PDF generation + Excel + email send) to run
    // AFTER the HTTP response is sent. Previously this blocked the response
    // for 700ms–1.8s. The admin now gets an immediate 200; the customer
    // receives the email within a moment.
    //
    // after() is Next.js's built-in post-response scheduling — Vercel's
    // runtime waits for it before freeing the function, so work is never
    // silently dropped. Failures are already logged to notification_attempts
    // by EmailService's Phase 6 instrumentation.
    after(async () => {
      try {
        // Generate PDF
        const pdfBuffer = generateOrderPDF({
      order_number: order.order_number,
      type: order.type,
      status: order.status,
      created_at: order.created_at,
      submitted_at: order.submitted_at,
      quoted_at: order.quoted_at,
      total_quantity: order.total_quantity,
      total_amount: order.total_amount,
      quoted_amount: order.quoted_amount,
      final_amount: order.final_amount,
      quote_expires_at: order.quote_expires_at,
      customer_notes: order.notes,
      customer: order.customer ? {
        company_name: order.customer.company_name,
        contact_name: order.customer.contact_name,
        contact_email: order.customer.contact_email,
        contact_phone: order.customer.contact_phone,
        billing_address: order.customer.billing_address,
        shipping_address: order.customer.shipping_address,
      } : undefined,
      items: order.items?.map(item => ({
        device: item.device,
        quantity: item.quantity,
        storage: item.storage,
        claimed_condition: item.claimed_condition,
        actual_condition: item.actual_condition,
        unit_price: item.unit_price,
        quoted_price: item.quoted_price,
        final_price: item.final_price,
        guaranteed_buyback_price: item.guaranteed_buyback_price,
        buyback_condition: item.buyback_condition,
        buyback_valid_until: item.buyback_valid_until,
      })),
    })

    // Generate Excel
    const excelBuffer = await buildExcelBuffer(order, bodyValidityDays)

    const subtotalAmount = order.final_amount || order.quoted_amount || order.total_amount || 0
    const emailTaxLine = computeOrderTaxLine({ type: order.type, subtotal: subtotalAmount, billingAddress: order.customer?.billing_address })
    const grandTotal = emailTaxLine ? emailTaxLine.total : subtotalAmount
    const totalFormatted = grandTotal > 0 ? `$${grandTotal.toFixed(2)}` : 'See attached'

    // siteUrl is captured from the outer scope (set before after() was scheduled)
    const orderUrl = `${siteUrl}/customer/orders/${order.id}`

    const safeOrderNumHtml = escapeHtml(order.order_number || '')
    const safeTotalFormatted = escapeHtml(totalFormatted)
    // CPO quotes show a Subtotal + Tax breakdown above the (tax-inclusive) total.
    const taxRowsHtml = emailTaxLine
      ? `<tr><td style="padding:6px 12px;background:#f5f5f5;font-weight:600;border:1px solid #e0e0e0">Subtotal</td><td style="padding:6px 12px;border:1px solid #e0e0e0">$${emailTaxLine.subtotal.toFixed(2)}</td></tr>
    <tr><td style="padding:6px 12px;background:#f5f5f5;font-weight:600;border:1px solid #e0e0e0">${escapeHtml(emailTaxLine.label)}</td><td style="padding:6px 12px;border:1px solid #e0e0e0">$${emailTaxLine.taxAmount.toFixed(2)}</td></tr>`
      : ''
    const quoteValidityDays = (order.quote_expires_at && order.quoted_at)
      ? Math.max(1, Math.round((new Date(order.quote_expires_at).getTime() - new Date(order.quoted_at).getTime()) / (1000 * 60 * 60 * 24)))
      : bodyValidityDays

    const itemRows = (order.items || []).map(item => {
      const deviceLabel = item.device
        ? `${item.device.make || ''} ${item.device.model || ''}`.trim()
        : ''
      // Fall back to device name embedded in notes (stored by upload-csv for unmatched rows)
      const deviceFromNotes = !deviceLabel && item.notes
        ? (item.notes.match(/^\[Device: ([^\]]+)\]/) || [])[1] || ''
        : ''
      const device = escapeHtml(deviceLabel || deviceFromNotes || 'Unknown Device')
      const storage = escapeHtml(item.storage || '—')
      const condition = escapeHtml((item.claimed_condition || '—').replace(/_/g, ' '))
      const qty = item.quantity ?? 1
      const unit = item.unit_price ?? item.guaranteed_buyback_price ?? 0
      const unitDisplay = unit > 0 ? `$${unit.toFixed(2)}` : '—'
      return `<tr>
        <td style="padding:6px 10px;border:1px solid #e0e0e0">${device}</td>
        <td style="padding:6px 10px;border:1px solid #e0e0e0">${storage}</td>
        <td style="padding:6px 10px;border:1px solid #e0e0e0">${condition}</td>
        <td style="padding:6px 10px;border:1px solid #e0e0e0;text-align:right">${qty}</td>
        <td style="padding:6px 10px;border:1px solid #e0e0e0;text-align:right">${unitDisplay}</td>
      </tr>`
    }).join('')

    const lineItemsTable = itemRows ? `
  <table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:13px">
    <thead>
      <tr style="background:#f5f5f5">
        <th style="padding:6px 10px;border:1px solid #e0e0e0;text-align:left">Device</th>
        <th style="padding:6px 10px;border:1px solid #e0e0e0;text-align:left">Storage</th>
        <th style="padding:6px 10px;border:1px solid #e0e0e0;text-align:left">Condition</th>
        <th style="padding:6px 10px;border:1px solid #e0e0e0;text-align:right">Qty</th>
        <th style="padding:6px 10px;border:1px solid #e0e0e0;text-align:right">Unit Price</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>` : ''

    // Passive heads-up only — full per-device reason/before/after lives in
    // the attached PDF's "Price Adjustment Details" section and the Excel's
    // extra columns, not duplicated here.
    const adjustedCount = (order.items || []).filter(item => buildPriceAdjustmentNote(item) != null).length
    const adjustmentNotice = adjustedCount > 0
      ? `<p style="margin:8px 0;font-size:13px;color:#555">Note: ${adjustedCount} device${adjustedCount === 1 ? '' : 's'} had a price adjustment after inspection — see the attached ${docType} for full details.</p>`
      : ''

    const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
  <h2 style="color:#111">Your ${docType} — Order ${safeOrderNumHtml}</h2>
  <p>Hi ${customerName},</p>
  <p>Please find your <strong>${docType.toLowerCase()}</strong> for order <strong>${safeOrderNumHtml}</strong> attached as a PDF and Excel file.</p>
  ${isQuote ? `<p style="margin:8px 0;font-size:13px;color:#b65d2f;font-weight:600">This quote is valid for ${quoteValidityDays} days${order.quote_expires_at ? ` (expires ${formatDate(order.quote_expires_at)})` : ''}.</p>` : ''}
  <table style="border-collapse:collapse;width:100%;margin:16px 0">
    <tr><td style="padding:6px 12px;background:#f5f5f5;font-weight:600;border:1px solid #e0e0e0">Order Number</td><td style="padding:6px 12px;border:1px solid #e0e0e0">${safeOrderNumHtml}</td></tr>
    ${taxRowsHtml}
    <tr><td style="padding:6px 12px;background:#f5f5f5;font-weight:600;border:1px solid #e0e0e0">Total Amount</td><td style="padding:6px 12px;border:1px solid #e0e0e0">${safeTotalFormatted}</td></tr>
    <tr><td style="padding:6px 12px;background:#f5f5f5;font-weight:600;border:1px solid #e0e0e0">Date</td><td style="padding:6px 12px;border:1px solid #e0e0e0">${formatDate(order.quoted_at || order.created_at)}</td></tr>
  </table>
  ${lineItemsTable}
  ${adjustmentNotice}
  ${order.notes ? `<div style="margin:16px 0;padding:12px 16px;background:#f9f9f9;border-left:4px solid #e0a96d;border-radius:4px">
    <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.06em">Notes</p>
    <p style="margin:0;font-size:13px;color:#333;white-space:pre-wrap">${escapeHtml(order.notes)}</p>
  </div>` : ''}
  <div style="margin:24px 0;text-align:center">
    <a href="${orderUrl}" style="display:inline-block;padding:14px 32px;background:#b65d2f;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">View &amp; Accept Quote in Portal</a>
  </div>
  <p style="color:#888;font-size:12px;margin-top:4px;text-align:center">Or copy this link: ${orderUrl}</p>
  <p>If you have any questions, please contact our team.</p>
  <p style="color:#888;font-size:12px;margin-top:32px">— Byte-Back</p>
</div>`

    await EmailService.sendEmailWithAttachments(
      customerEmail,
      `${docType} — Order ${order.order_number}`,
      html,
      [
        { filename: `${filenameBase}.pdf`, content: Buffer.from(pdfBuffer), contentType: 'application/pdf' },
        { filename: `${filenameBase}.xlsx`, content: excelBuffer, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      ]
    )
    // Send success is logged by EmailService's notification_attempts instrumentation
  } catch (bgError) {
    // Logged to notification_attempts by EmailService's instrumentation; also
    // surface to server logs so it shows in Vercel's function log stream.
    console.error('[send-quote-email] Background send failed:', bgError)
  }
    }) // end after()

    // Return immediately — the admin gets a response in <200ms instead of
    // waiting for PDF generation + Excel + email round-trip (~700ms–1.8s).
    return NextResponse.json({ ok: true, queued: true, recipient: customerEmail })
  } catch (error) {
    console.error('Send quote email error (validation):', error)
    return NextResponse.json({ error: safeErrorMessage(error, 'Failed to send quote email') }, { status: 500 })
  }
}
