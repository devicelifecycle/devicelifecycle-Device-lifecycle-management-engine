// ============================================================================
// VENDOR ORDERS API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { VendorService } from '@/services/vendor.service'
export const dynamic = 'force-dynamic'


const INTERNAL_ROLES = ['admin', 'coe_manager', 'coe_tech', 'sales']

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role, organization_id')
      .eq('id', user.id)
      .single()

    const vendor = await VendorService.getVendorById((await params).id)
    if (!vendor) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
    }

    if (!INTERNAL_ROLES.includes(profile?.role || '')) {
      if (profile?.organization_id !== vendor.organization_id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const searchParams = request.nextUrl.searchParams
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '50'), 1), 100)

    const orders = await VendorService.getVendorOrders((await params).id, limit)
    return NextResponse.json({ data: orders })
  } catch (error) {
    console.error('Error fetching vendor orders:', error)
    return NextResponse.json(
      { error: 'Failed to fetch vendor orders' },
      { status: 500 }
    )
  }
}
