// ============================================================================
// ORDER PDF DOWNLOAD API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { OrderService } from '@/services/order.service'
import { generateOrderPDF } from '@/lib/pdf'

interface RouteParams {
  params: {
    id: string
  }
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const order = await OrderService.getOrderById(params.id)
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const isQuote = ['draft', 'submitted', 'quoted'].includes(order.status)
    const docType = isQuote ? 'Quote' : 'Invoice'
    const filename = `${order.order_number}-${docType}.pdf`

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
      items: order.items?.map((item) => ({
        device: item.device,
        quantity: item.quantity,
        claimed_condition: item.claimed_condition,
        unit_price: item.unit_price,
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
