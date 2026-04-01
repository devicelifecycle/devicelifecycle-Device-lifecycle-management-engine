// ============================================================================
// TRIAGE EXCEPTION HANDLING API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { TriageService } from '@/services/triage.service'
export const dynamic = 'force-dynamic'


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
      .select('role, organization_id')
      .eq('id', user.id)
      .single()

    if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    // Resolve triage result and verify order ownership for customer
    const serviceRole = createServiceRoleClient()

    const { data: triage } = await serviceRole
      .from('triage_results')
      .select('*, order:orders(id, customer_id, customer:customers(organization_id))')
      .eq('id', params.id)
      .single()

    if (!triage) return NextResponse.json({ error: 'Exception not found' }, { status: 404 })

    const order = triage.order as { customer_id?: string; customer?: { organization_id?: string } } | null
    const orderCustomerOrg = order?.customer?.organization_id

    const canApprove =
      ['admin', 'coe_manager'].includes(profile.role) ||
      (profile.role === 'customer' && orderCustomerOrg === profile.organization_id)

    if (!canApprove) {
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
