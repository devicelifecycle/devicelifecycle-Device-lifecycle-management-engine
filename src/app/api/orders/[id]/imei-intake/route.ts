// ============================================================================
// CPO IMEI INTAKE
// GET  /api/orders/[id]/imei-intake  — fulfillment summary (ordered/received/outstanding)
// POST /api/orders/[id]/imei-intake  — bulk-register a vendor's supplied IMEIs
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { IMEIService } from '@/services/imei.service'
import { dedupeImeiRows } from '@/lib/imei-intake'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

const STAFF = ['admin', 'coe_manager', 'coe_tech']

const schema = z.object({
  vendor_id: z.string().uuid(),
  warranty_days: z.number().int().min(1).max(3650).optional(),
  rows: z.array(z.object({
    imei: z.string().trim().min(4).max(20),
    serial_number: z.string().trim().max(100).optional(),
    device_id: z.string().uuid().optional(),
  })).min(1).max(5000),
})

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  if (!['admin', 'coe_manager', 'coe_tech', 'sales'].includes(auth.profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const fulfillment = await IMEIService.getOrderFulfillment((await params).id)
  return NextResponse.json(fulfillment)
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, profile } = auth
    if (!STAFF.includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const orderId = (await params).id
    const { data: order } = await supabase.from('orders').select('id, type').eq('id', orderId).single()
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    if (order.type !== 'cpo') {
      return NextResponse.json({ error: 'IMEI intake applies to CPO orders only' }, { status: 400 })
    }

    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
    }

    // Drop duplicate IMEIs within the uploaded batch before touching the DB.
    const rows = dedupeImeiRows(parsed.data.rows.map((r) => ({ ...r, imei: r.imei.trim() })))

    const result = await IMEIService.bulkCreateFromVendor({
      orderId,
      vendorId: parsed.data.vendor_id,
      warrantyDays: parsed.data.warranty_days ?? 365,
      rows,
    })

    const fulfillment = await IMEIService.getOrderFulfillment(orderId)
    return NextResponse.json({ ...result, fulfillment })
  } catch (error) {
    console.error('IMEI intake failed:', error)
    return NextResponse.json({ error: 'Failed to record IMEIs' }, { status: 500 })
  }
}
