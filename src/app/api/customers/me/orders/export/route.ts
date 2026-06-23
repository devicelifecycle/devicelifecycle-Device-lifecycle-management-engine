// ============================================================================
// MY ORDER HISTORY EXPORT — CSV or PDF, scoped to the logged-in customer.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { generateOrderHistoryPDF } from '@/lib/pdf'

export const dynamic = 'force-dynamic'

const MAX_ORDERS = 1000

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { effectiveRole, profile } = auth

    if (effectiveRole !== 'customer') {
      return NextResponse.json({ error: 'Forbidden — customer role required' }, { status: 403 })
    }
    if (!profile.organization_id) {
      return NextResponse.json({ error: 'No organization associated with this account' }, { status: 400 })
    }

    const format = request.nextUrl.searchParams.get('format') === 'pdf' ? 'pdf' : 'csv'

    const serviceRole = createServiceRoleClient()
    const { data: customer } = await serviceRole
      .from('customers')
      .select('id, company_name, contact_name')
      .eq('organization_id', profile.organization_id)
      .maybeSingle()

    if (!customer) {
      return NextResponse.json({ error: 'Customer profile not found' }, { status: 404 })
    }

    const { data: orders } = await serviceRole
      .from('orders')
      .select('order_number, type, status, created_at, total_quantity, total_amount, quoted_amount')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false })
      .limit(MAX_ORDERS)

    const rows = orders || []

    if (format === 'pdf') {
      const pdfBuffer = generateOrderHistoryPDF(customer.company_name || customer.contact_name || 'Customer', rows)
      return new NextResponse(new Uint8Array(pdfBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="order-history.pdf"',
          'Content-Length': String(pdfBuffer.length),
        },
      })
    }

    const csvHeader = ['Order #', 'Type', 'Status', 'Date', 'Qty', 'Amount'].join(',')
    const csvRows = rows.map((o) =>
      [
        o.order_number,
        o.type === 'trade_in' ? 'Trade-In' : 'CPO',
        o.status,
        o.created_at,
        o.total_quantity ?? 0,
        o.quoted_amount ?? o.total_amount ?? 0,
      ].join(',')
    )
    const csv = [csvHeader, ...csvRows].join('\n')

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="order-history.csv"',
      },
    })
  } catch (error) {
    console.error('Error exporting order history:', error)
    return NextResponse.json({ error: 'Failed to export order history' }, { status: 500 })
  }
}
