// ============================================================================
// SEND QUOTE DIRECTLY TO CUSTOMER — PDF + Excel attachments
// POST /api/orders/[id]/send-quote-email
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { OrderService } from '@/services/order.service'
import { EmailService } from '@/services/email.service'
import { generateOrderPDF } from '@/lib/pdf'
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

async function buildExcelBuffer(order: Awaited<ReturnType<typeof OrderService.getOrderById>>): Promise<Buffer> {
  const ExcelJS = await import('exceljs')
  const isQuote = ['draft', 'submitted', 'quoted'].includes(order!.status)
  const docType = isQuote ? 'Quote' : 'Invoice'
  const wb = new ExcelJS.default.Workbook()

  // Summary sheet
  const ws1 = wb.addWorksheet('Summary')
  ws1.columns = [{ width: 20 }, { width: 40 }]
  const summaryData: (string | number | null | undefined)[][] = [
    ['DLM Engine — ' + docType],
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
    ...(order!.notes ? [[], ['Notes', order!.notes]] as (string | number | null | undefined)[][] : []),
  ]
  summaryData.forEach(row => ws1.addRow(row))

  // Line Items sheet
  const ws2 = wb.addWorksheet('Line Items')
  ws2.columns = [
    { width: 30 }, { width: 10 }, { width: 12 }, { width: 10 }, { width: 14 }, { width: 14 },
  ]
  ws2.addRow(['Device', 'Storage', 'Condition', 'Quantity', 'Unit Price', 'Total'])
  for (const item of order!.items || []) {
    const rawLabel = item.device ? `${item.device.make || ''} ${item.device.model || ''}`.trim() : ''
    const deviceFromNotes = !rawLabel && item.notes
      ? (item.notes.match(/^\[Device: ([^\]]+)\]/) || [])[1] || ''
      : ''
    const device = rawLabel || deviceFromNotes || 'Unknown Device'
    const qty = item.quantity ?? 1
    const unit = item.unit_price ?? item.guaranteed_buyback_price ?? 0
    const total = unit * qty
    ws2.addRow([
      device,
      item.storage || '—',
      (item.claimed_condition || '—').replace(/_/g, ' '),
      qty,
      unit > 0 ? unit : '—',
      total > 0 ? total : '—',
    ])
  }

  const arrayBuffer = await wb.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    if (!['admin', 'coe_manager', 'sales'].includes(profile.role)) {
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

    const isQuote = ['draft', 'submitted', 'quoted'].includes(order.status)
    const docType = isQuote ? 'Quote' : 'Invoice'
    const safeOrderNum = (order.order_number || '').replace(/[^a-zA-Z0-9._-]/g, '_')
    const filenameBase = `${safeOrderNum}-${docType}`

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
        unit_price: item.unit_price,
        guaranteed_buyback_price: item.guaranteed_buyback_price,
        buyback_condition: item.buyback_condition,
        buyback_valid_until: item.buyback_valid_until,
      })),
    })

    // Generate Excel
    const excelBuffer = await buildExcelBuffer(order)

    const quotedTotal = order.quoted_amount ?? order.total_amount ?? 0
    const totalFormatted = quotedTotal > 0 ? `$${quotedTotal.toFixed(2)}` : 'See attached'

    // Derive absolute URL from env var → request host fallback so email links
    // are never relative (relative URLs are non-functional in email clients).
    const envSiteUrl = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '')
    const requestOrigin = `${req.nextUrl.protocol}//${req.nextUrl.host}`
    const siteUrl = envSiteUrl || requestOrigin
    const orderUrl = `${siteUrl}/customer/orders/${order.id}`

    const safeOrderNumHtml = escapeHtml(order.order_number || '')
    const safeTotalFormatted = escapeHtml(totalFormatted)

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

    const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
  <h2 style="color:#111">Your ${docType} — Order ${safeOrderNumHtml}</h2>
  <p>Hi ${customerName},</p>
  <p>Please find your <strong>${docType.toLowerCase()}</strong> for order <strong>${safeOrderNumHtml}</strong> attached as a PDF and Excel file.</p>
  <table style="border-collapse:collapse;width:100%;margin:16px 0">
    <tr><td style="padding:6px 12px;background:#f5f5f5;font-weight:600;border:1px solid #e0e0e0">Order Number</td><td style="padding:6px 12px;border:1px solid #e0e0e0">${safeOrderNumHtml}</td></tr>
    <tr><td style="padding:6px 12px;background:#f5f5f5;font-weight:600;border:1px solid #e0e0e0">Total Amount</td><td style="padding:6px 12px;border:1px solid #e0e0e0">${safeTotalFormatted}</td></tr>
    <tr><td style="padding:6px 12px;background:#f5f5f5;font-weight:600;border:1px solid #e0e0e0">Date</td><td style="padding:6px 12px;border:1px solid #e0e0e0">${formatDate(order.quoted_at || order.created_at)}</td></tr>
  </table>
  ${lineItemsTable}
  ${order.notes ? `<div style="margin:16px 0;padding:12px 16px;background:#f9f9f9;border-left:4px solid #e0a96d;border-radius:4px">
    <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#888;text-transform:uppercase;letter-spacing:0.06em">Notes</p>
    <p style="margin:0;font-size:13px;color:#333;white-space:pre-wrap">${escapeHtml(order.notes)}</p>
  </div>` : ''}
  <div style="margin:24px 0;text-align:center">
    <a href="${orderUrl}" style="display:inline-block;padding:14px 32px;background:#b65d2f;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px;">View &amp; Accept Quote in Portal</a>
  </div>
  <p style="color:#888;font-size:12px;margin-top:4px;text-align:center">Or copy this link: ${orderUrl}</p>
  <p>If you have any questions, please contact our team.</p>
  <p style="color:#888;font-size:12px;margin-top:32px">— DLM Engine</p>
</div>`

    const sent = await EmailService.sendEmailWithAttachments(
      customerEmail,
      `${docType} — Order ${order.order_number}`,
      html,
      [
        { filename: `${filenameBase}.pdf`, content: Buffer.from(pdfBuffer), contentType: 'application/pdf' },
        { filename: `${filenameBase}.xlsx`, content: excelBuffer, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      ]
    )

    return NextResponse.json({ ok: true, email_sent: sent, recipient: customerEmail })
  } catch (error) {
    console.error('Send quote email error:', error)
    return NextResponse.json({ error: safeErrorMessage(error, 'Failed to send quote email') }, { status: 500 })
  }
}
