// ============================================================================
// EXCEPTIONS API - GET PENDING EXCEPTIONS
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user profile
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    // Only COE/Admin can view exceptions
    if (!profile || !['admin', 'coe_manager', 'coe_tech'].includes(profile.role)) {
      return NextResponse.json(
        { error: 'Only COE and Admin can view exceptions' },
        { status: 403 }
      )
    }

    // Get filters from query params
    const searchParams = request.nextUrl.searchParams
    const severity = searchParams.get('severity')
    const status = searchParams.get('status')
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500)
    const offset = parseInt(searchParams.get('offset') || '0')

    // Build query
    let query = supabase
      .from('order_exceptions')
      .select(
        `
        id,
        order_id,
        severity,
        approval_status,
        summary,
        created_at,
        order:orders(id, order_number)
        `,
        { count: 'exact' }
      )

    // Apply status filter
    if (status && status !== 'all') {
      query = query.eq('approval_status', status)
    } else {
      // Default: show pending and unresolved exceptions
      query = query.in('approval_status', ['pending', 'coe_approved'])
    }

    // Apply severity filter
    if (severity && severity !== 'all') {
      query = query.eq('severity', severity)
    }

    // Sort & paginate
    query = query
      .order('severity', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    const { data, error, count } = await query

    if (error) {
      throw new Error(error.message)
    }

    return NextResponse.json({
      data: data || [],
      total: count || 0,
      limit,
      offset,
    })
  } catch (error) {
    console.error('Error fetching exceptions:', error)
    const message = error instanceof Error ? error.message : 'Failed to fetch exceptions'
    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}
