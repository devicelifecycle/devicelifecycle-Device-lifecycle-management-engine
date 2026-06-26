// ============================================================================
// ORDER PDF DOWNLOAD API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { OrderService } from '@/services/order.service'
import { generateOrderPDF } from '@/lib/pdf'
export const dynamic = 'force-dynamic'


export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { authUser, profile, effectiveRole } = auth

    const order = await OrderService.getOrderById((await params).id)
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Authorization: same as GET /api/orders/[id]
    const { role, organization_id } = profile
    if (role === 'admin' || role === 'coe_manager' || role === 'coe_tech') {
      // Internal roles have full access
    } else if (role === 'sales') {
      if (order.created_by_id !== authUser.id && order.assigned_to_id !== authUser.id) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    } else if (effectiveRole === 'customer') {
      if (order.customer?.organization_id !== organization_id) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    } else if (effectiveRole === 'vendor') {
      if (order.vendor?.organization_id !== organization_id) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
      // Vendors must not see customer PII — use placeholders for PDF
      order.customer = order.customer ? {
        ...order.customer,
        company_name: '—',
        contact_name: '—',
        contact_email: '—',
        contact_phone: undefined,
        billing_address: undefined,
        shipping_address: undefined,
      } : order.customer
    } else {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const isQuote = ['draft', 'submitted', 'quoted'].includes(order.status)
    const docType = isQuote ? 'Quote' : 'Invoice'
    const safeOrderNum = (order.order_number || '').replace(/[^a-zA-Z0-9._-]/g, '_')
    const filename = `${safeOrderNum}-${docType}.pdf`

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
      items: order.items?.map((item) => ({
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

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdfBuffer.length),
      },
    })
  } catch (error) {
    console.error('Error generating PDF:', error)
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 })
  }
}
