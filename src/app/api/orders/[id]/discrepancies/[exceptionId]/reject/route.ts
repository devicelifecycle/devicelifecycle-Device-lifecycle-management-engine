// ============================================================================
// EXCEPTION REJECTION ENDPOINT
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { ExceptionService } from '@/services/exception.service'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; exceptionId: string }> }
) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    const { id: orderId, exceptionId } = await params

    if (!orderId || !exceptionId) {
      return NextResponse.json(
        { error: 'Order ID and Exception ID required' },
        { status: 400 }
      )
    }

    // Parse request body
    const body = await request.json()
    const { reason } = body

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return NextResponse.json(
        { error: 'Rejection reason required' },
        { status: 400 }
      )
    }

    if (!['coe_manager', 'coe_tech', 'admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden — COE or admin role required' }, { status: 403 })
    }

    // Verify exception belongs to order
    const { data: exception } = await supabase
      .from('order_exceptions')
      .select('id, order_id, approval_status')
      .eq('id', exceptionId)
      .eq('order_id', orderId)
      .single()

    if (!exception) {
      return NextResponse.json({ error: 'Exception not found' }, { status: 404 })
    }

    if (exception.approval_status === 'rejected') {
      return NextResponse.json(
        { error: 'Exception already rejected' },
        { status: 400 }
      )
    }

    if (exception.approval_status === 'admin_approved' || exception.approval_status === 'overridden') {
      return NextResponse.json(
        { error: 'Cannot reject an already approved exception' },
        { status: 400 }
      )
    }

    // Reject exception
    const updated = await ExceptionService.rejectException(exceptionId, authUser.id, reason)

    return NextResponse.json(updated, { status: 200 })
  } catch (error) {
    console.error('Error rejecting exception:', error)
    const message = error instanceof Error ? error.message : 'Failed to reject exception'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
