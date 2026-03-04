// ============================================================================
// IMEI LOOKUP/SEARCH API
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { IMEIService } from '@/services/imei.service'

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q') || searchParams.get('query') || ''
    const vendorId = searchParams.get('vendor_id')
    const customerId = searchParams.get('customer_id')

    // Search by vendor
    if (vendorId) {
      const records = await IMEIService.getByVendor(vendorId)
      return NextResponse.json({ data: records })
    }

    // Search by customer
    if (customerId) {
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
      { error: error instanceof Error ? error.message : 'Failed to search IMEI records' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check role
    const { data: user } = await supabase
      .from('users')
      .select('role')
      .eq('id', session.user.id)
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

    const record = await IMEIService.createIMEIRecord(body, session.user.id)
    return NextResponse.json(record, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create IMEI record'
    const status = message.includes('already exists') ? 409 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
