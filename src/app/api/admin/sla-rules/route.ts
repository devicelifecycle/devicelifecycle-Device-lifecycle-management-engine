// ============================================================================
// SLA RULES API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { SLAService } from '@/services/sla.service'
import { createSLARuleSchema } from '@/lib/validations'

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

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
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const validationResult = createSLARuleSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.errors },
        { status: 400 }
      )
    }

    // Add default escalation_user_ids field
    const slaData = {
      ...validationResult.data,
      escalation_user_ids: []
    }

    const rule = await SLAService.createSLARule(slaData)
    return NextResponse.json(rule, { status: 201 })
  } catch (error) {
    console.error('Error creating SLA rule:', error)
    return NextResponse.json(
      { error: 'Failed to create SLA rule' },
      { status: 500 }
    )
  }
}
