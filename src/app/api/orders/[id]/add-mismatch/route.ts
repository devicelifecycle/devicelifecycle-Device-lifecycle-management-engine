// ============================================================================
// ADD MANUAL MISMATCH API
// Admin adds devices that were mismatched (claimed vs actual condition).
// Creates imei_record + triage_result for exception workflow linkage.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { AuditService } from '@/services/audit.service'
import { NotificationService } from '@/services/notification.service'
import { addManualMismatchSchema } from '@/lib/validations'
import { safeErrorMessage } from '@/lib/utils'
import type { DeviceCondition } from '@/types'
export const dynamic = 'force-dynamic'

function calculatePriceAdjustment(
  claimed: DeviceCondition,
  actual: DeviceCondition,
  quotedPrice: number
): number {
  const order: DeviceCondition[] = ['new', 'excellent', 'good', 'fair', 'poor']
  const claimedIdx = order.indexOf(claimed)
  const actualIdx = order.indexOf(actual)
  if (actualIdx <= claimedIdx || quotedPrice <= 0) return 0
  const downgradeSteps = actualIdx - claimedIdx
  const pctPerStep = 0.15
  const reduction = quotedPrice * (1 - Math.pow(1 - pctPerStep, downgradeSteps))
  return -Math.round(reduction * 100) / 100
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'coe_manager'].includes(profile.role)) {
      return NextResponse.json(
        { error: 'Only administrators and CoE managers can add mismatched devices' },
        { status: 403 }
      )
    }

    const { data: order } = await supabase
      .from('orders')
      .select('id, order_number, customer_id, customer:customers(organization_id, contact_email, company_name)')
      .eq('id', params.id)
      .single()

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    const body = await request.json()
    const validationResult = addManualMismatchSchema.safeParse(body)
    if (!validationResult.success) {
      const firstError = validationResult.error.errors[0]
      return NextResponse.json(
        { error: firstError?.message || 'Validation failed' },
        { status: 400 }
      )
    }

    const { items } = validationResult.data

    const { data: orderItems } = await supabase
      .from('order_items')
      .select('id, device_id, storage, claimed_condition, unit_price, quoted_price, device:device_catalog(make, model)')
      .eq('order_id', params.id)
      .in('id', items.map((i) => i.order_item_id))

    if (!orderItems || orderItems.length === 0) {
      return NextResponse.json({ error: 'No matching order items found' }, { status: 400 })
    }

    const itemById = new Map(orderItems.map((i) => [i.id, i]))
    const added: Array<{
      order_item_id: string
      claimed_condition: string
      actual_condition: string
      imei_record_id: string
      triage_result_id: string
      price_adjustment?: number
      exception_required?: boolean
      device_label?: string
    }> = []
    const skipped: Array<{ order_item_id: string; reason: string }> = []

    for (const req of items) {
      const orderItem = itemById.get(req.order_item_id)
      if (!orderItem) {
        skipped.push({ order_item_id: req.order_item_id, reason: 'Item not found' })
        continue
      }
      const claimed = (orderItem.claimed_condition || 'good') as DeviceCondition
      const actual = req.actual_condition as DeviceCondition
      if (claimed === actual) {
        skipped.push({
          order_item_id: req.order_item_id,
          reason: `Actual condition must differ from claimed (${claimed})`,
        })
        continue
      }

      const imeiValue = req.imei?.trim() || `MANUAL-${req.order_item_id}`

      const { data: existingImei } = await supabase
        .from('imei_records')
        .select('id')
        .eq('order_id', params.id)
        .eq('imei', imeiValue)
        .single()

      if (existingImei) {
        skipped.push({
          order_item_id: req.order_item_id,
          reason: 'IMEI already exists for this order',
        })
        continue
      }

      const quotedPrice = orderItem.quoted_price ?? orderItem.unit_price ?? 0
      const priceAdjustment = calculatePriceAdjustment(claimed, actual, quotedPrice)
      const conditionChanged = true
      const exceptionRequired = priceAdjustment < -50

      const { data: imeiRecord, error: imeiError } = await supabase
        .from('imei_records')
        .insert({
          imei: imeiValue,
          order_id: params.id,
          order_item_id: req.order_item_id,
          device_id: orderItem.device_id,
          claimed_condition: claimed,
          actual_condition: actual,
          quoted_price: quotedPrice,
          triage_status: exceptionRequired ? 'needs_exception' : 'complete',
          metadata: { source: 'admin_added_mismatch', added_by: user.id },
        })
        .select('id')
        .single()

      if (imeiError) {
        skipped.push({
          order_item_id: req.order_item_id,
          reason: imeiError.message || 'Failed to create IMEI record',
        })
        continue
      }

      const { data: triageResult, error: triageError } = await supabase
        .from('triage_results')
        .insert({
          imei_record_id: imeiRecord.id,
          order_id: params.id,
          physical_condition: actual,
          functional_grade: actual,
          cosmetic_grade: actual,
          final_condition: actual,
          condition_changed: conditionChanged,
          price_adjustment: priceAdjustment,
          exception_required: exceptionRequired,
          exception_reason: exceptionRequired
            ? `Admin-added mismatch: claimed ${claimed}, actual ${actual}. Price adjustment: $${priceAdjustment.toFixed(2)}.`
            : null,
          triaged_by_id: user.id,
          triaged_at: new Date().toISOString(),
          notes: req.notes || 'Added manually by admin',
        })
        .select('id')
        .single()

      if (triageError) {
        await supabase.from('imei_records').delete().eq('id', imeiRecord.id)
        skipped.push({
          order_item_id: req.order_item_id,
          reason: triageError.message || 'Failed to create triage result',
        })
        continue
      }

      await supabase
        .from('order_items')
        .update({
          actual_condition: actual,
          updated_at: new Date().toISOString(),
        })
        .eq('id', req.order_item_id)
        .eq('order_id', params.id)

      added.push({
        order_item_id: req.order_item_id,
        claimed_condition: claimed,
        actual_condition: actual,
        imei_record_id: imeiRecord.id,
        triage_result_id: triageResult.id,
        price_adjustment: priceAdjustment,
        exception_required: exceptionRequired,
        device_label: orderItem.device
          ? `${(orderItem.device as { make?: string }).make} ${(orderItem.device as { model?: string }).model}`
          : undefined,
      })
    }

    for (const a of added) {
      if (a.exception_required && order.customer_id) {
        await NotificationService.sendExceptionNotification({
          order_id: params.id,
          order_number: order.order_number,
          customer_id: order.customer_id,
          imei: `MANUAL-${a.order_item_id}`,
          device_name: a.device_label,
          exception_reason: `Admin-added mismatch: claimed ${a.claimed_condition}, actual ${a.actual_condition}. Price adjustment: $${(a.price_adjustment ?? 0).toFixed(2)}.`,
          adjustment_amount: a.price_adjustment,
        })
      }
    }

    if (added.length === 0) {
      return NextResponse.json(
        {
          error: 'No items were added',
          skipped,
        },
        { status: 400 }
      )
    }

    if (order.customer_id) {
      const customer = order.customer as { organization_id?: string } | null
      const customerOrg = customer?.organization_id
      if (customerOrg) {
        const { data: customerUsers } = await supabase
          .from('users')
          .select('id')
          .eq('organization_id', customerOrg)
          .eq('role', 'customer')
          .eq('is_active', true)

        for (const cu of customerUsers || []) {
          await NotificationService.createNotification({
            user_id: cu.id,
            type: 'in_app',
            title: `Condition mismatch recorded — ${order.order_number}`,
            message: `${added.length} device(s) were marked as condition mismatch and require your review.`,
            link: `/orders/${params.id}`,
            metadata: {
              order_id: params.id,
              order_number: order.order_number,
              mismatched_count: added.length,
              source: 'admin_added_mismatch',
            },
          })
        }
      }
    }

    await AuditService.log({
      user_id: user.id,
      action: 'price_change',
      entity_type: 'order',
      entity_id: params.id,
      old_values: {
        items: added.map((a) => ({
          order_item_id: a.order_item_id,
          claimed_condition: a.claimed_condition,
        })),
      },
      new_values: {
        items: added.map((a) => ({
          order_item_id: a.order_item_id,
          actual_condition: a.actual_condition,
          imei_record_id: a.imei_record_id,
          triage_result_id: a.triage_result_id,
        })),
      },
      metadata: {
        event: 'admin_added_mismatch',
        mismatched_count: added.length,
        skipped_count: skipped.length,
      },
    })

    return NextResponse.json({
      success: true,
      order_id: params.id,
      added_count: added.length,
      skipped_count: skipped.length,
      added,
      skipped,
    })
  } catch (error) {
    console.error('Error adding manual mismatch:', error)
    return NextResponse.json(
      { error: safeErrorMessage(error, 'Failed to add mismatch') },
      { status: 500 }
    )
  }
}
