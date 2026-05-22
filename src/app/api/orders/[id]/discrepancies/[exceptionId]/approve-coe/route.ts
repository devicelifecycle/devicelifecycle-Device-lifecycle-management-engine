// ============================================================================
// EXCEPTION APPROVAL - COE APPROVAL ENDPOINT
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
    const { notes } = body

    // Verify user is COE
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

    if (exception.approval_status !== 'pending') {
      return NextResponse.json(
        { error: `Cannot approve exception with status: ${exception.approval_status}` },
        { status: 400 }
      )
    }

    // Approve exception
    const updated = await ExceptionService.approveByCOE(exceptionId, authUser.id, notes)

    return NextResponse.json(updated, { status: 200 })
  } catch (error) {
    console.error('Error approving exception:', error)
    const message = error instanceof Error ? error.message : 'Failed to approve exception'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
