// ============================================================================
// IMEI API - GET/PATCH by IMEI number
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { IMEIService } from '@/services/imei.service'

export async function GET(
  request: NextRequest,
  { params }: { params: { imei: string } }
) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const record = await IMEIService.getByIMEI(params.imei)
    if (!record) {
      return NextResponse.json({ error: 'IMEI not found' }, { status: 404 })
    }

    return NextResponse.json(record)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch IMEI record' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { imei: string } }
) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check role - only admin, coe_manager, coe_tech can update IMEI records
    const { data: user } = await supabase
      .from('users')
      .select('role')
      .eq('id', session.user.id)
      .single()

    if (!user || !['admin', 'coe_manager', 'coe_tech'].includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const record = await IMEIService.updateIMEIRecord(
      params.imei,
      body,
      session.user.id,
      body.event_description
    )

    return NextResponse.json(record)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update IMEI record' },
      { status: 500 }
    )
  }
}
