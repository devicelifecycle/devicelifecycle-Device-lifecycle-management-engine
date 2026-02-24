// ============================================================================
// TRIAGE API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { TriageService } from '@/services/triage.service'

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'coe_manager', 'coe_tech'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const type = searchParams.get('type')

    if (type === 'exceptions') {
      const exceptions = await TriageService.getExceptionItems()
      return NextResponse.json({ data: exceptions })
    }

    if (type === 'pending') {
      const pending = await TriageService.getPendingTriageItems()
      return NextResponse.json({ data: pending })
    }

    const orderId = searchParams.get('order_id')
    if (orderId) {
      const results = await TriageService.getTriageResultsForOrder(orderId)
      return NextResponse.json({ data: results })
    }

    // Default: pending items
    const pending = await TriageService.getPendingTriageItems()
    return NextResponse.json({ data: pending })
  } catch (error) {
    console.error('Error fetching triage data:', error)
    return NextResponse.json({ error: 'Failed to fetch triage data' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'coe_manager', 'coe_tech'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const result = await TriageService.submitTriageResult({
      ...body,
      triaged_by_id: user.id,
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('Error submitting triage:', error)
    return NextResponse.json({ error: 'Failed to submit triage' }, { status: 500 })
  }
}
