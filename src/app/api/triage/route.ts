// ============================================================================
// TRIAGE API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { TriageService } from '@/services/triage.service'
import { triageSubmitSchema } from '@/lib/validations'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

// Schema for manually adding a device to triage
const addDeviceSchema = z.object({
  action: z.literal('add_device'),
  imei: z.string().min(1, 'IMEI is required'),
  device_id: z.string().uuid('Invalid device ID'),
  claimed_condition: z.enum(['new', 'excellent', 'good', 'fair', 'poor']),
  storage: z.string().optional(),
  color: z.string().optional(),
  notes: z.string().optional(),
  order_id: z.string().uuid().optional(), // Optional - can add without order
})

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

    // Handle manual device addition
    if (body.action === 'add_device') {
      const validation = addDeviceSchema.safeParse(body)
      if (!validation.success) {
        return NextResponse.json(
          { error: 'Validation failed', details: validation.error.errors },
          { status: 400 }
        )
      }

      const { imei, device_id, claimed_condition, storage, color, notes, order_id } = validation.data

      // Check if IMEI already exists
      const { data: existing } = await supabase
        .from('imei_records')
        .select('id, imei')
        .eq('imei', imei)
        .single()

      if (existing) {
        return NextResponse.json(
          { error: `Device with IMEI ${imei} already exists in the system` },
          { status: 409 }
        )
      }

      // Create IMEI record with pending triage status
      const { data: imeiRecord, error: insertError } = await supabase
        .from('imei_records')
        .insert({
          imei,
          device_id,
          claimed_condition,
          metadata: {
            storage,
            color,
            added_by_id: user.id,
            added_manually: true,
            notes: notes || `Manually added by ${profile.role}`,
          },
          triage_status: 'pending',
          order_id: order_id || null,
        })
        .select(`
          *,
          device:device_catalog(make, model)
        `)
        .single()

      if (insertError) {
        console.error('Error adding device:', insertError)
        return NextResponse.json({ error: 'Failed to add device' }, { status: 500 })
      }

      return NextResponse.json({ data: imeiRecord, message: 'Device added to triage queue' }, { status: 201 })
    }

    // Handle regular triage submission
    const validation = triageSubmitSchema.safeParse(body)
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.errors },
        { status: 400 }
      )
    }

    const result = await TriageService.submitTriageResult({
      ...validation.data,
      triaged_by_id: user.id,
    })

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error('Error submitting triage:', error)
    return NextResponse.json({ error: 'Failed to submit triage' }, { status: 500 })
  }
}
