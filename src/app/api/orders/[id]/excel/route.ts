// ============================================================================
// ORDER EXCEL DOWNLOAD API ROUTE
// GET /api/orders/[id]/excel
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { OrderService } from '@/services/order.service'
import * as XLSX from 'xlsx'
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
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const order = await OrderService.getOrderById((await params).id)
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    const { data: profile } = await supabase.from('users').select('role, organization_id').eq('id', user.id).single()
    if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { role, organization_id } = profile
    if (!['admin', 'coe_manager', 'coe_tech', 'sales'].includes(role)) {
      if (role === 'customer' && order.customer?.organization_id !== organization_id) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    const isQuote = ['draft', 'submitted', 'quoted'].includes(order.status)
    const docType = isQuote ? 'Quote' : 'Invoice'
    const wb = XLSX.utils.book_new()

    // ── Sheet 1: Summary ────────────────────────────────────────────────────
    const summaryData = [
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
    ]
    const ws1 = XLSX.utils.aoa_to_sheet(summaryData)
    ws1['!cols'] = [{ wch: 20 }, { wch: 40 }]
    XLSX.utils.book_append_sheet(wb, ws1, 'Summary')

    // ── Sheet 2: Line Items ──────────────────────────────────────────────────
    const headers = ['Device', 'Storage', 'Condition', 'Quantity', 'Unit Price', 'Total']
    const rows: (string | number)[][] = (order.items || []).map(item => {
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

    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' }) as Buffer
    const filename = `${order.order_number}-${docType}.xlsx`

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
