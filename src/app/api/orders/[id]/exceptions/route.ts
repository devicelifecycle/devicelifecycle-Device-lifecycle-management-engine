// ============================================================================
// ORDER EXCEPTIONS API — Pending condition mismatches for customer approval
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { TriageService } from '@/services/triage.service'
import { OrderService } from '@/services/order.service'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    const order = await OrderService.getOrderById((await params).id)
    if (!order) return NextResponse.json({ error: 'Order not found' }, { status: 404 })

    // Customer: only their org's orders
    if (effectiveRole === 'customer') {
      const orderCustomerOrg = (order.customer as { organization_id?: string })?.organization_id
      if (orderCustomerOrg !== profile.organization_id) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    // Internal roles: admin, coe_manager, coe_tech, sales
    if (!['admin', 'coe_manager', 'coe_tech', 'sales', 'customer'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const exceptions = await TriageService.getPendingExceptionsForOrder((await params).id)
    return NextResponse.json({ data: exceptions })
  } catch (error) {
    console.error('Error fetching order exceptions:', error)
    return NextResponse.json({ error: 'Failed to fetch exceptions' }, { status: 500 })
  }
}
