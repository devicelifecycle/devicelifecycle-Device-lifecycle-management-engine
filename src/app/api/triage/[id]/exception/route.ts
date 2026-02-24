// ============================================================================
// TRIAGE EXCEPTION HANDLING API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { TriageService } from '@/services/triage.service'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    // Only admin and coe_manager can approve/reject exceptions
    if (!profile || !['admin', 'coe_manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { approved, notes } = body

    if (typeof approved !== 'boolean') {
      return NextResponse.json({ error: 'approved field is required' }, { status: 400 })
    }

    const result = await TriageService.handleException(
      params.id,
      approved,
      user.id,
      notes
    )

    return NextResponse.json(result)
  } catch (error) {
    console.error('Error handling exception:', error)
    return NextResponse.json({ error: 'Failed to handle exception' }, { status: 500 })
  }
}
