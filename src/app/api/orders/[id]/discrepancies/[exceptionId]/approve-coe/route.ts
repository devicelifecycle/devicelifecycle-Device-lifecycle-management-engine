// ============================================================================
// EXCEPTION APPROVAL - COE APPROVAL ENDPOINT
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ExceptionService } from '@/services/exception.service'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; exceptionId: string } }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: orderId, exceptionId } = params

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
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['coe_manager', 'coe_tech'].includes(profile.role)) {
      return NextResponse.json(
        { error: 'Only COE can approve exceptions' },
        { status: 403 }
      )
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

    if (exception.approval_status !== 'pending') {
      return NextResponse.json(
        { error: `Cannot approve exception with status: ${exception.approval_status}` },
        { status: 400 }
      )
    }

    // Approve exception
    const updated = await ExceptionService.approveByCOE(exceptionId, user.id, notes)

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
