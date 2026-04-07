// ============================================================================
// EXCEPTION APPROVAL - ADMIN APPROVAL ENDPOINT
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ExceptionService } from '@/services/exception.service'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; exceptionId: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: orderId, exceptionId } = await params

    if (!orderId || !exceptionId) {
      return NextResponse.json(
        { error: 'Order ID and Exception ID required' },
        { status: 400 }
      )
    }

    // Parse request body
    const body = await request.json()
    const { notes, override = false } = body

    // Verify user is Admin
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only admin can approve exceptions' },
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

    // If not override, verify COE has already approved
    if (!override && exception.approval_status !== 'coe_approved') {
      return NextResponse.json(
        {
          error: 'COE must approve before admin approval (use override=true to bypass)',
        },
        { status: 400 }
      )
    }

    if (exception.approval_status === 'admin_approved' || exception.approval_status === 'overridden') {
      return NextResponse.json(
        { error: `Exception already ${exception.approval_status}` },
        { status: 400 }
      )
    }

    // Approve exception
    const updated = await ExceptionService.approveByAdmin(
      exceptionId,
      user.id,
      override,
      notes
    )

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
