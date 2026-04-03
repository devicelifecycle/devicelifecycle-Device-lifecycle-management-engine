// ============================================================================
// IMEI API - GET/PATCH by IMEI number
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { safeErrorMessage } from '@/lib/utils'
import { IMEIService } from '@/services/imei.service'
export const dynamic = 'force-dynamic'


export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ imei: string }> }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const record = await IMEIService.getByIMEI((await params).imei)
    if (!record) {
      return NextResponse.json({ error: 'IMEI not found' }, { status: 404 })
    }

    // Enforce org boundary for non-admin/coe_manager (IDOR prevention)
    const { data: userProfile } = await supabase
      .from('users')
      .select('role, organization_id')
      .eq('id', user.id)
      .single()
    // Only internal roles with IMEI responsibility can access
    if (!userProfile || !['admin', 'coe_manager', 'coe_tech'].includes(userProfile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (userProfile.role === 'coe_tech' && userProfile.organization_id) {
      let hasAccess = false
      if (record.source_vendor_id) {
        const { data: v } = await supabase.from('vendors').select('organization_id').eq('id', record.source_vendor_id).single()
        if (v?.organization_id === userProfile.organization_id) hasAccess = true
      }
      if (!hasAccess && record.current_customer_id) {
        const { data: c } = await supabase.from('customers').select('organization_id').eq('id', record.current_customer_id).single()
        if (c?.organization_id === userProfile.organization_id) hasAccess = true
      }
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
    const supabase = await createServerSupabaseClient()
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check role - only admin, coe_manager, coe_tech can update IMEI records
    const { data: userProfile } = await supabase
      .from('users')
      .select('role, organization_id')
      .eq('id', authUser.id)
      .single()

    if (!userProfile || !['admin', 'coe_manager', 'coe_tech'].includes(userProfile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const record = await IMEIService.getByIMEI((await params).imei)
    if (!record) {
      return NextResponse.json({ error: 'IMEI not found' }, { status: 404 })
    }

    // Enforce org boundary for non-admin/coe_manager (IDOR prevention)
    if (userProfile.role === 'coe_tech' && userProfile.organization_id) {
      let hasAccess = false
      if (record.source_vendor_id) {
        const { data: v } = await supabase.from('vendors').select('organization_id').eq('id', record.source_vendor_id).single()
        if (v?.organization_id === userProfile.organization_id) hasAccess = true
      }
      if (!hasAccess && record.current_customer_id) {
        const { data: c } = await supabase.from('customers').select('organization_id').eq('id', record.current_customer_id).single()
        if (c?.organization_id === userProfile.organization_id) hasAccess = true
      }
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
