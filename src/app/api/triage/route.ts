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
  order_id: z.string().uuid().optional(),
  order_item_id: z.string().uuid().optional(),
})

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
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
    const supabase = await createServerSupabaseClient()
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

      const { imei, device_id, claimed_condition, storage, color, notes, order_id, order_item_id } = validation.data

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
          order_item_id: order_item_id || null,
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

    // Handle bulk import from CSV upload
    if (body.action === 'bulk_import') {
      type ImportRow = {
        imei?: string
        serial?: string
        device_id?: string | null
        claimed_condition?: string
        storage?: string
        color?: string
        battery_health?: number
        sim_lock?: string
        locked_carrier?: string
        device_cost?: number
        repair_cost?: number
        quantity?: number
        notes?: string
        order_id?: string
        order_item_id?: string
      }
      const importRows: ImportRow[] = Array.isArray(body.rows) ? body.rows : []
      const validConditions = ['new', 'excellent', 'good', 'fair', 'poor']
      let imported = 0
      let skipped = 0
      let duplicate = 0
      let failed = 0
      let missingIdentifiers = 0
      const errors: string[] = []

      for (const row of importRows) {
        if (!row.device_id) {
          skipped++
          errors.push('Skipped row without matched device ID')
          continue
        }
        const imei = String(row.imei ?? '').trim()
        const serial = String(row.serial ?? '').trim()
        const identifier = imei || serial
        if (!identifier) {
          skipped++
          missingIdentifiers++
          errors.push('Skipped row without IMEI or Serial')
          continue
        }

        // Skip already-registered IMEIs — use separate .eq() calls to avoid
        // string interpolation into .or() which is vulnerable to filter injection.
        let existing: { id: string } | null = null
        if (imei) {
          const { data } = await supabase
            .from('imei_records').select('id').eq('imei', imei).maybeSingle()
          existing = data
        }
        if (!existing && serial) {
          const { data } = await supabase
            .from('imei_records').select('id').eq('serial_number', serial).maybeSingle()
          existing = data
        }
        if (existing) {
          skipped++
          duplicate++
          errors.push(`Skipped duplicate identifier: ${identifier}`)
          continue
        }

        const condition = validConditions.includes(row.claimed_condition ?? '') ? row.claimed_condition : 'good'
        const { error: insertError } = await supabase.from('imei_records').insert({
          imei: imei || null,
          serial_number: serial || null,
          device_id: row.device_id,
          claimed_condition: condition,
          triage_status: 'pending',
          order_id: row.order_id || null,
          order_item_id: row.order_item_id || null,
          metadata: {
            storage: row.storage,
            color: row.color,
            battery_health: row.battery_health,
            sim_lock: row.sim_lock,
            locked_carrier: row.locked_carrier,
            device_cost: row.device_cost,
            repair_cost: row.repair_cost,
            notes: row.notes,
            bulk_imported: true,
            imported_by_id: user.id,
          },
        })
        if (insertError) {
          failed++
          errors.push(`Failed to import ${identifier}: ${insertError.message}`)
          continue
        }
        imported++
      }

      return NextResponse.json({
        imported,
        skipped,
        duplicate,
        failed,
        missing_identifiers: missingIdentifiers,
        errors,
      }, { status: 201 })
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
    const message = error instanceof Error ? error.message : 'Failed to submit triage'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
