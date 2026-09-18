// ============================================================================
// SLA RULES API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { SLAService } from '@/services/sla.service'
import { createSLARuleSchema } from '@/lib/validations'
export const dynamic = 'force-dynamic'


export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    if (auth.effectiveRole !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const rules = await SLAService.getSLARules()
    return NextResponse.json({ data: rules })
  } catch (error) {
    console.error('Error fetching SLA rules:', error)
    return NextResponse.json(
      { error: 'Failed to fetch SLA rules' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    if (auth.effectiveRole !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const body = await request.json()
    const validationResult = createSLARuleSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.errors },
        { status: 400 }
      )
    }

    const d = validationResult.data
    const rule = await SLAService.createSLARule({
      name: d.name,
      description: d.description ?? null,
      from_status: d.from_status,
      order_type: d.order_type ?? null,
      warning_hours: d.warning_hours,
      breach_hours: d.breach_hours,
      escalation_user_ids: d.escalation_user_ids,
      is_active: d.is_active,
    })
    return NextResponse.json(rule, { status: 201 })
  } catch (error) {
    console.error('Error creating SLA rule:', error)
    return NextResponse.json(
      { error: 'Failed to create SLA rule' },
      { status: 500 }
    )
  }
}
