// ============================================================================
// SLA RULE BY ID API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/supabase/require-permission'
import { SLAService } from '@/services/sla.service'
import { updateSLARuleSchema } from '@/lib/validations'
import type { SLARule } from '@/types'
export const dynamic = 'force-dynamic'


export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await requirePermission('platform.manage')
    if ('error' in guard) return guard.error

    const body = await request.json()
    const validationResult = updateSLARuleSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.errors },
        { status: 400 }
      )
    }
    // null is meaningful here: it clears description, and sets order_type to
    // NULL = "applies to all types". Passed through as-is.
    const patch: Partial<SLARule> = validationResult.data
    const rule = await SLAService.updateSLARule((await params).id, patch)
    return NextResponse.json(rule)
  } catch (error) {
    console.error('Error updating SLA rule:', error)
    return NextResponse.json(
      { error: 'Failed to update SLA rule' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await requirePermission('platform.manage')
    if ('error' in guard) return guard.error

    await SLAService.deleteSLARule((await params).id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting SLA rule:', error)
    return NextResponse.json(
      { error: 'Failed to delete SLA rule' },
      { status: 500 }
    )
  }
}
