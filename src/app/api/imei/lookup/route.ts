// ============================================================================
// IMEI LOOKUP/SEARCH API
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { safeErrorMessage } from '@/lib/utils'
import { IMEIService } from '@/services/imei.service'
export const dynamic = 'force-dynamic'


export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: userProfile } = await supabase
      .from('users')
      .select('role, organization_id')
      .eq('id', user.id)
      .single()

    if (!userProfile || !['admin', 'coe_manager', 'coe_tech'].includes(userProfile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q') || searchParams.get('query') || ''
    const vendorId = searchParams.get('vendor_id')
    const customerId = searchParams.get('customer_id')

    // Search by vendor - enforce org boundary (IDOR prevention)
    if (vendorId) {
      const { data: vendor } = await supabase
        .from('vendors')
        .select('organization_id')
        .eq('id', vendorId)
        .single()
      if (!vendor) return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
      if (userProfile.role === 'coe_tech' && vendor.organization_id !== userProfile.organization_id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const records = await IMEIService.getByVendor(vendorId)
      return NextResponse.json({ data: records })
    }

    // Search by customer - enforce org boundary (IDOR prevention)
    if (customerId) {
      const { data: customer } = await supabase
        .from('customers')
        .select('organization_id')
        .eq('id', customerId)
        .single()
      if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
      if (userProfile.role === 'coe_tech' && customer.organization_id !== userProfile.organization_id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const records = await IMEIService.getByCustomer(customerId)
      return NextResponse.json({ data: records })
    }

    // General search
    if (!query || query.length < 2) {
      return NextResponse.json({ error: 'Query must be at least 2 characters' }, { status: 400 })
    }

    const records = await IMEIService.searchIMEI(query)
    return NextResponse.json({ data: records })
  } catch (error) {
    return NextResponse.json(
      { error: safeErrorMessage(error, 'Failed to search IMEI records') },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check role
    const { data: user } = await supabase
      .from('users')
      .select('role')
      .eq('id', authUser.id)
      .single()

    if (!user || !['admin', 'coe_manager', 'coe_tech'].includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()

    if (!body.imei || !body.device_catalog_id || !body.storage || !body.condition) {
      return NextResponse.json(
        { error: 'Missing required fields: imei, device_catalog_id, storage, condition' },
        { status: 400 }
      )
    }

    const record = await IMEIService.createIMEIRecord(body, authUser.id)
    return NextResponse.json(record, { status: 201 })
  } catch (error) {
    const safeMsg = safeErrorMessage(error, 'Failed to create IMEI record')
    const isConflict = error instanceof Error && error.message.includes('already exists')
    return NextResponse.json({ error: safeMsg }, { status: isConflict ? 409 : 500 })
  }
}
