// ============================================================================
// SEND QUOTE DIRECTLY TO CUSTOMER — PDF + Excel attachments
// POST /api/orders/[id]/send-quote-email
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { OrderService } from '@/services/order.service'
import { EmailService } from '@/services/email.service'
import { generateOrderPDF } from '@/lib/pdf'
import * as XLSX from 'xlsx'
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

function buildExcelBuffer(order: Awaited<ReturnType<typeof OrderService.getOrderById>>): Buffer {
  const isQuote = ['draft', 'submitted', 'quoted'].includes(order!.status)
  const docType = isQuote ? 'Quote' : 'Invoice'
  const wb = XLSX.utils.book_new()

  const summaryData = [
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
  ]
  const ws1 = XLSX.utils.aoa_to_sheet(summaryData)
  ws1['!cols'] = [{ wch: 20 }, { wch: 40 }]
  XLSX.utils.book_append_sheet(wb, ws1, 'Summary')

  const headers = ['Device', 'Storage', 'Condition', 'Quantity', 'Unit Price', 'Total']
  const rows: (string | number)[][] = (order!.items || []).map(item => {
    const device = item.device ? `${item.device.make || ''} ${item.device.model || ''}`.trim() : '—'
    const qty = item.quantity ?? 1
    const unit = item.unit_price ?? item.guaranteed_buyback_price ?? 0
    const total = unit * qty
    return [
      device,
      item.storage || '—',
      (item.claimed_condition || '—').replace(/_/g, ' '),
      qty,
      unit > 0 ? unit : '—',
      total > 0 ? total : '—',
    ]
  })
  const ws2 = XLSX.utils.aoa_to_sheet([headers, ...rows])
  ws2['!cols'] = [{ wch: 30 }, { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, ws2, 'Line Items')

  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (!profile || !['admin', 'coe_manager', 'sales'].includes(profile.role)) {
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
    const excelBuffer = buildExcelBuffer(order)

    const quotedTotal = order.quoted_amount ?? order.total_amount ?? 0
    const totalFormatted = quotedTotal > 0 ? `$${quotedTotal.toFixed(2)}` : 'See attached'

    const safeOrderNumHtml = escapeHtml(order.order_number || '')
    const safeTotalFormatted = escapeHtml(totalFormatted)
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
