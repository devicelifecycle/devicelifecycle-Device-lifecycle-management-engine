// ============================================================================
// IMEI API - GET/PATCH by IMEI number
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { safeErrorMessage } from '@/lib/utils'
import { IMEIService } from '@/services/imei.service'
export const dynamic = 'force-dynamic'


export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ imei: string }> }
) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    const record = await IMEIService.getByIMEI((await params).imei)
    if (!record) {
      return NextResponse.json({ error: 'IMEI not found' }, { status: 404 })
    }

    // Enforce org boundary for non-admin/coe_manager (IDOR prevention)
    // Only internal roles with IMEI responsibility can access
    if (!profile || !['admin', 'coe_manager', 'coe_tech'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (profile.role === 'coe_tech' && profile.organization_id) {
      const [vendorResult, customerResult] = await Promise.all([
        record.source_vendor_id
          ? supabase.from('vendors').select('organization_id').eq('id', record.source_vendor_id).single()
          : Promise.resolve({ data: null }),
        record.current_customer_id
          ? supabase.from('customers').select('organization_id').eq('id', record.current_customer_id).single()
          : Promise.resolve({ data: null }),
      ])
      const hasAccess =
        vendorResult.data?.organization_id === profile.organization_id ||
        customerResult.data?.organization_id === profile.organization_id
      if (!hasAccess) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    return NextResponse.json(record)
  } catch (error) {
    return NextResponse.json(
      { error: safeErrorMessage(error, 'Failed to fetch IMEI record') },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ imei: string }> }
) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile } = auth

    if (!['admin', 'coe_manager', 'coe_tech'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Check role - only admin, coe_manager, coe_tech can update IMEI records
    const record = await IMEIService.getByIMEI((await params).imei)
    if (!record) {
      return NextResponse.json({ error: 'IMEI not found' }, { status: 404 })
    }

    // Enforce org boundary for non-admin/coe_manager (IDOR prevention)
    if (profile.role === 'coe_tech' && profile.organization_id) {
      const [vendorResult, customerResult] = await Promise.all([
        record.source_vendor_id
          ? supabase.from('vendors').select('organization_id').eq('id', record.source_vendor_id).single()
          : Promise.resolve({ data: null }),
        record.current_customer_id
          ? supabase.from('customers').select('organization_id').eq('id', record.current_customer_id).single()
          : Promise.resolve({ data: null }),
      ])
      const hasAccess =
        vendorResult.data?.organization_id === profile.organization_id ||
        customerResult.data?.organization_id === profile.organization_id
      if (!hasAccess) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const body = await request.json()
    const updated = await IMEIService.updateIMEIRecord(
      (await params).imei,
      body,
      authUser.id,
      body.event_description
    )

    return NextResponse.json(updated)
  } catch (error) {
    return NextResponse.json(
      { error: safeErrorMessage(error, 'Failed to update IMEI record') },
      { status: 500 }
    )
  }
}
