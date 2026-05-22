// ============================================================================
// ORDER EXCEL DOWNLOAD API ROUTE
// GET /api/orders/[id]/excel
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { OrderService } from '@/services/order.service'
export const dynamic = 'force-dynamic'

function formatCurrency(n?: number | null): string {
  if (n == null) return '—'
  return `$${n.toFixed(2)}`
}

function formatDate(s?: string | null): string {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    const order = await OrderService.getOrderById((await params).id)
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    const { role, organization_id } = profile
    const isInternalRole = ['admin', 'coe_manager', 'coe_tech', 'sales'].includes(role)
    const isOwnCustomer = role === 'customer' && order.customer?.organization_id === organization_id
    if (!isInternalRole && !isOwnCustomer) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const isQuote = ['draft', 'submitted', 'quoted'].includes(order.status)
    const docType = isQuote ? 'Quote' : 'Invoice'
    const ExcelJS = await import('exceljs')
    const wb = new ExcelJS.default.Workbook()

    // ── Sheet 1: Summary ────────────────────────────────────────────────────
    const ws1 = wb.addWorksheet('Summary')
    ws1.columns = [{ width: 20 }, { width: 40 }]
    ;[
      ['DLM Engine — ' + docType],
      [],
      ['Order Number', order.order_number],
      ['Type', (order.type || '').replace(/_/g, ' ').toUpperCase()],
      ['Status', (order.status || '').replace(/_/g, ' ').toUpperCase()],
      ['Date', formatDate(order.created_at)],
      ['Quoted Date', formatDate(order.quoted_at)],
      [],
      ['Customer', order.customer?.company_name || '—'],
      ['Contact', order.customer?.contact_name || '—'],
      ['Email', order.customer?.contact_email || '—'],
      ['Phone', order.customer?.contact_phone || '—'],
      [],
      ['Total Quantity', order.total_quantity ?? '—'],
      ['Quoted Amount', formatCurrency(order.quoted_amount ?? order.total_amount)],
      ['Final Amount', formatCurrency(order.final_amount)],
    ].forEach(row => ws1.addRow(row))

    // ── Sheet 2: Line Items ──────────────────────────────────────────────────
    const ws2 = wb.addWorksheet('Line Items')
    ws2.columns = [
      { width: 30 }, { width: 10 }, { width: 12 }, { width: 10 }, { width: 14 }, { width: 14 },
    ]
    ws2.addRow(['Device', 'Storage', 'Condition', 'Quantity', 'Unit Price', 'Total'])
    for (const item of order.items || []) {
      const device = item.device ? `${item.device.make || ''} ${item.device.model || ''}`.trim() : '—'
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
    const buf = Buffer.from(arrayBuffer)
    const safeOrderNum = (order.order_number || '').replace(/[^a-zA-Z0-9._-]/g, '_')
    const filename = `${safeOrderNum}-${docType}.xlsx`

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buf.length),
      },
    })
  } catch (error) {
    console.error('Error generating Excel:', error)
    return NextResponse.json({ error: 'Failed to generate Excel' }, { status: 500 })
  }
}
