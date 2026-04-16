// ============================================================================
// TRIAGE SERVICE
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { NotificationService } from '@/services/notification.service'
import { OrderService } from '@/services/order.service'
import type { 
  IMEIRecord, 
  DeviceCondition, 
  TriageResult,
  Order,
  OrderStatus,
} from '@/types'

export interface TriageInput {
  imei_record_id: string
  physical_condition: DeviceCondition
  functional_grade: DeviceCondition
  cosmetic_grade: DeviceCondition
  screen_condition: 'good' | 'cracked' | 'damaged' | 'dead'
  battery_health: number // Percentage 0-100
  storage_verified: boolean
  original_accessories: boolean
  functional_tests: {
    touchscreen: boolean
    display: boolean
    speakers: boolean
    microphone: boolean
    cameras: boolean
    wifi: boolean
    bluetooth: boolean
    cellular: boolean
    charging_port: boolean
    buttons: boolean
    face_id_or_touch_id: boolean
    gps: boolean
  }
  notes: string
  triaged_by_id: string
}

export interface TriageOutcome {
  passed: boolean
  final_condition: DeviceCondition
  condition_changed: boolean
  price_adjustment: number
  exception_required: boolean
  exception_reason?: string
}

export class TriageService {
  /**
   * Submit triage results for a device
   */
  static async submitTriageResult(input: TriageInput): Promise<{
    triageResult: TriageResult
    outcome: TriageOutcome
  }> {
    const supabase = await createServerSupabaseClient()

    // Get the IMEI record
    const { data: imeiRecord, error: imeiError } = await supabase
      .from('imei_records')
      .select(`
        *,
        order:orders(*)
      `)
      .eq('id', input.imei_record_id)
      .single()

    if (imeiError || !imeiRecord) {
      throw new Error('IMEI record not found')
    }

    const pricedImeiRecord = await this.resolveImeiQuotedPrice(imeiRecord as IMEIRecord, supabase)
    if (!pricedImeiRecord) {
      throw new Error('IMEI record not found')
    }

    // Calculate outcome
    const outcome = this.calculateTriageOutcome(input, pricedImeiRecord)

    // Create triage result
    const { data: triageResult, error: triageError } = await supabase
      .from('triage_results')
      .insert({
        imei_record_id: input.imei_record_id,
        order_id: imeiRecord.order_id,
        physical_condition: input.physical_condition,
        functional_grade: input.functional_grade,
        cosmetic_grade: input.cosmetic_grade,
        screen_condition: input.screen_condition,
        battery_health: input.battery_health,
        storage_verified: input.storage_verified,
        original_accessories: input.original_accessories,
        functional_tests: input.functional_tests,
        final_condition: outcome.final_condition,
        condition_changed: outcome.condition_changed,
        price_adjustment: outcome.price_adjustment,
        exception_required: outcome.exception_required,
        exception_reason: outcome.exception_reason,
        notes: input.notes,
        triaged_by_id: input.triaged_by_id,
        triaged_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (triageError) {
      throw new Error(triageError.message)
    }

    // Update IMEI record with triage results
    await supabase
      .from('imei_records')
      .update({
        actual_condition: outcome.final_condition,
        triage_status: outcome.exception_required ? 'needs_exception' : 'complete',
      })
      .eq('id', input.imei_record_id)

    // If exception required, notify the customer organization
    if (outcome.exception_required && imeiRecord.order) {
      const order = imeiRecord.order as unknown as Order
      if (order.customer_id) {
        // Get device info for notification
        let deviceName = ''
        if (imeiRecord.device_id) {
          const { data: device } = await supabase
            .from('device_catalog')
            .select('make, model')
            .eq('id', imeiRecord.device_id)
            .single()
          if (device) deviceName = `${device.make} ${device.model}`
        }

        await NotificationService.sendExceptionNotification({
          order_id: order.id,
          order_number: order.order_number,
          customer_id: order.customer_id,
          imei: imeiRecord.imei,
          device_name: deviceName,
          exception_reason: outcome.exception_reason || 'Condition mismatch detected during triage',
          adjustment_amount: outcome.price_adjustment,
        })
      }
    }

    await this.syncOrderStatusAfterTriage(
      imeiRecord.order_id,
      (imeiRecord.order as Partial<Order> | null)?.status,
      input.triaged_by_id,
    )

    return {
      triageResult: triageResult as TriageResult,
      outcome,
    }
  }

  /**
   * Calculate triage outcome based on test results
   */
  private static calculateTriageOutcome(input: TriageInput, imeiRecord: IMEIRecord): TriageOutcome {
    const tests = input.functional_tests
    
    // Count failed tests
    const failedTests = Object.values(tests).filter(v => !v).length
    const totalTests = Object.values(tests).length

    // Determine final condition based on various factors
    let finalCondition = input.physical_condition

    // Downgrade based on failed tests
    if (failedTests > 3) {
      finalCondition = 'poor'
    } else if (failedTests > 1) {
      finalCondition = this.downgradeCondition(finalCondition)
    }

    // Downgrade based on battery health
    if (input.battery_health < 70) {
      finalCondition = 'poor'
    } else if (input.battery_health < 80) {
      finalCondition = this.downgradeCondition(finalCondition)
    }

    // Screen condition affects grade significantly
    if (input.screen_condition === 'damaged' || input.screen_condition === 'dead') {
      finalCondition = 'poor'
    } else if (input.screen_condition === 'cracked') {
      finalCondition = this.downgradeCondition(finalCondition)
    }

    // Check if condition changed from claimed
    const conditionChanged = finalCondition !== imeiRecord.claimed_condition

    // Calculate price adjustment (negative if downgraded)
    const priceAdjustment = this.calculatePriceAdjustment(
      imeiRecord.claimed_condition as DeviceCondition,
      finalCondition,
      imeiRecord.quoted_price || 0
    )

    // Determine if exception is required
    const exceptionRequired = conditionChanged && priceAdjustment < -50 // More than $50 adjustment
    
    let exceptionReason: string | undefined
    if (exceptionRequired) {
      exceptionReason = `Condition changed from ${imeiRecord.claimed_condition} to ${finalCondition}. ` +
        `Price adjustment: $${priceAdjustment.toFixed(2)}. ` +
        `Failed tests: ${failedTests}/${totalTests}. ` +
        `Battery health: ${input.battery_health}%. ` +
        `Screen: ${input.screen_condition}.`
    }

    return {
      passed: !exceptionRequired,
      final_condition: finalCondition,
      condition_changed: conditionChanged,
      price_adjustment: priceAdjustment,
      exception_required: exceptionRequired,
      exception_reason: exceptionReason,
    }
  }

  /**
   * Downgrade a condition by one level
   */
  private static downgradeCondition(condition: DeviceCondition): DeviceCondition {
    const order: DeviceCondition[] = ['new', 'excellent', 'good', 'fair', 'poor']
    const currentIndex = order.indexOf(condition)
    return currentIndex < order.length - 1 ? order[currentIndex + 1] : 'poor'
  }

  /**
   * Calculate price adjustment based on condition change
   */
  private static calculatePriceAdjustment(
    claimedCondition: DeviceCondition,
    actualCondition: DeviceCondition,
    quotedPrice: number
  ): number {
    const multipliers: Record<DeviceCondition, number> = {
      'new': 1.0,
      'excellent': 0.9,
      'good': 0.8,
      'fair': 0.65,
      'poor': 0.4,
    }

    const claimedMultiplier = multipliers[claimedCondition] || 1
    const actualMultiplier = multipliers[actualCondition] || 1

    // Guard against division by zero
    if (claimedMultiplier === 0) return 0

    // Calculate the original base price
    const basePrice = quotedPrice / claimedMultiplier
    
    // Calculate new price and adjustment
    const newPrice = basePrice * actualMultiplier
    const adjustment = newPrice - quotedPrice

    return Math.round(adjustment * 100) / 100
  }

  /**
   * Get triage results for an order
   */
  static async getTriageResultsForOrder(orderId: string): Promise<TriageResult[]> {
    // Use service-role after route-level authorization so customer views can
    // safely read exception/triage details without tripping over RLS joins.
    const supabase = createServiceRoleClient()

    const { data, error } = await supabase
      .from('triage_results')
      .select(`
        *,
        imei_record:imei_records(*),
        triaged_by:users!triage_results_triaged_by_id_fkey(full_name, email)
      `)
      .eq('order_id', orderId)
      .order('triaged_at', { ascending: false })

    if (error) {
      throw new Error(error.message)
    }

    return data as TriageResult[]
  }

  /**
   * Get pending triage items
   */
  static async getPendingTriageItems(): Promise<IMEIRecord[]> {
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('imei_records')
      .select(`
        *,
        order:orders(
          id,
          order_number,
          created_by_id,
          created_by:users!orders_created_by_id_fkey(full_name, email)
        ),
        device:device_catalog(*)
      `)
      .eq('triage_status', 'pending')
      .order('created_at', { ascending: true })

    if (error) {
      throw new Error(error.message)
    }

    return data as IMEIRecord[]
  }

  /**
   * Get pending exceptions for an order (for customer or internal view)
   */
  static async getPendingExceptionsForOrder(orderId: string): Promise<TriageResult[]> {
    const results = await this.getTriageResultsForOrder(orderId)
    return results.filter(
      (r) => r.exception_required && !r.exception_approved_at
    ) as TriageResult[]
  }

  /**
   * Get items needing exception approval
   */
  static async getExceptionItems(): Promise<TriageResult[]> {
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('triage_results')
      .select(`
        *,
        imei_record:imei_records(*),
        order:orders(*),
        triaged_by:users!triage_results_triaged_by_id_fkey(full_name, email)
      `)
      .eq('exception_required', true)
      .is('exception_approved_at', null)
      .order('triaged_at', { ascending: true })

    if (error) {
      throw new Error(error.message)
    }

    return data as TriageResult[]
  }

  /**
   * Approve or reject an exception
   */
  static async handleException(
    triageResultId: string,
    approved: boolean,
    approvedById: string,
    notes?: string
  ): Promise<TriageResult> {
    const supabase = createServiceRoleClient()

    // Get the triage result with related data for notification
    const { data: existingTriage } = await supabase
      .from('triage_results')
      .select(`
        *,
        imei_record:imei_records(*),
        order:orders(*)
      `)
      .eq('id', triageResultId)
      .single()

    // Determine if this is a customer dispute or a final COE/admin decision.
    // When a customer rejects (disputes), the exception should remain open in the
    // COE queue so a manager can review it — we must NOT set exception_approved_at.
    // When COE/admin rejects, the decision is final and exception_approved_at is set.
    const { data: actorProfile } = await supabase
      .from('users')
      .select('role')
      .eq('id', approvedById)
      .single()
    const isCustomerDispute = !approved && actorProfile?.role === 'customer'

    const updatePayload: Record<string, unknown> = {
      exception_approved: approved,
      exception_approved_by_id: approvedById,
      exception_notes: notes,
    }
    // Only stamp exception_approved_at for final decisions (approved or COE/admin rejection).
    // Customer disputes leave it null so the exception stays visible in the COE queue.
    if (!isCustomerDispute) {
      updatePayload.exception_approved_at = new Date().toISOString()
    }

    const { data, error } = await supabase
      .from('triage_results')
      .update(updatePayload)
      .eq('id', triageResultId)
      .select()
      .single()

    if (error) {
      throw new Error(error.message)
    }

    // Update IMEI record status
    const triageResult = data as TriageResult
    const imeiRecord = await this.resolveImeiQuotedPrice(
      (existingTriage?.imei_record as IMEIRecord | null) ?? null,
      supabase,
    )
    // Customer disputes: put exception back to needs_exception so COE sees it.
    // Final decisions (approved or COE/admin rejection): mark complete or rejected.
    const imeiStatus = isCustomerDispute
      ? 'needs_exception'
      : approved ? 'complete' : 'rejected'
    await supabase
      .from('imei_records')
      .update({
        triage_status: imeiStatus,
        actual_condition: approved ? triageResult.final_condition : null,
      })
      .eq('id', triageResult.imei_record_id)

    // When approved, persist the adjusted final_price on the order item and recalculate order final_amount
    if (approved && imeiRecord?.order_item_id && existingTriage?.order?.id) {
      const resolvedQuotedPrice = imeiRecord.quoted_price ?? 0
      const priceAdjustment = existingTriage.price_adjustment ?? 0
      const newPrice = resolvedQuotedPrice + priceAdjustment

      await supabase
        .from('order_items')
        .update({ final_price: newPrice, updated_at: new Date().toISOString() })
        .eq('id', imeiRecord.order_item_id)

      // Recalculate final_amount for the order as sum of final_price * quantity
      const { data: allItems } = await supabase
        .from('order_items')
        .select('final_price, quoted_price, unit_price, quantity')
        .eq('order_id', existingTriage.order.id as string)

      if (allItems && allItems.length > 0) {
        const finalAmount = allItems.reduce((sum, item) => {
          const price = (item.final_price ?? item.quoted_price ?? item.unit_price ?? 0) as number
          const qty = (item.quantity ?? 1) as number
          return sum + price * qty
        }, 0)

        await supabase
          .from('orders')
          .update({ final_amount: finalAmount, updated_at: new Date().toISOString() })
          .eq('id', existingTriage.order.id as string)
      }
    }

    // When rejected, clear order_item.actual_condition for manual mismatches (admin-added via order page)
    if (!approved && imeiRecord?.order_item_id && String(imeiRecord?.imei || '').startsWith('MANUAL-')) {
      await supabase
        .from('order_items')
        .update({ actual_condition: null, updated_at: new Date().toISOString() })
        .eq('id', imeiRecord.order_item_id)
    }

    // Send notification to customer organization about exception resolution
    if (existingTriage?.order?.customer_id) {
      const order = existingTriage.order as unknown as Order
      const imeiRecord = existingTriage.imei_record as IMEIRecord | null
      const customerId = order.customer_id as string // We checked it exists above

      // Get device info
      let deviceName = ''
      if (imeiRecord?.device_id) {
        const { data: device } = await supabase
          .from('device_catalog')
          .select('make, model')
          .eq('id', imeiRecord.device_id)
          .single()
        if (device) deviceName = `${device.make} ${device.model}`
      }

      await NotificationService.sendExceptionResolvedNotification({
        order_id: order.id,
        order_number: order.order_number,
        customer_id: customerId,
        imei: imeiRecord?.imei,
        device_name: deviceName,
        approved,
        new_price: approved ? (imeiRecord?.quoted_price ?? 0) + (existingTriage.price_adjustment ?? 0) : undefined,
        notes,
      })

      // When exception is rejected/disputed, notify admins and COE managers so they
      // can investigate. Without this COE has no visibility that the customer disagreed.
      if (!approved) {
        const { data: internalUsers } = await supabase
          .from('users')
          .select('id')
          .in('role', ['admin', 'coe_manager'])
          .eq('is_active', true)

        const disputeTitle = `Exception disputed — Order #${order.order_number}`
        const disputeMsg = `${deviceName ? deviceName + ' — ' : ''}Exception was disputed${notes ? `: "${notes}"` : ''}. Manual review required.`

        for (const u of internalUsers || []) {
          await NotificationService.createNotification({
            user_id: (u as { id: string }).id,
            type: 'in_app',
            title: disputeTitle,
            message: disputeMsg,
            link: `/orders/${order.id}`,
            metadata: {
              order_id: order.id,
              order_number: order.order_number,
              triage_result_id: triageResultId,
              audience: 'internal',
            },
          }).catch(() => {})
        }
      }
    }

    await this.syncOrderStatusAfterTriage(
      existingTriage?.order?.id,
      (existingTriage?.order as Partial<Order> | null)?.status,
      approvedById,
    )

    if (approved && existingTriage?.order?.id) {
      const orderId = existingTriage.order.id as string
      const summary = await this.checkOrderTriageComplete(orderId)
      const { data: orderRow } = await supabase
        .from('orders')
        .select('status')
        .eq('id', orderId)
        .single()

      if (
        orderRow?.status === 'in_triage' &&
        summary.isComplete &&
        summary.pending === 0 &&
        summary.needsException === 0 &&
        OrderService.isValidTransition('in_triage', 'qc_complete')
      ) {
        await OrderService.transitionOrder(orderId, 'qc_complete', approvedById, 'All devices triaged')
      }
    }

    return triageResult
  }

  private static async resolveImeiQuotedPrice(
    imeiRecord: IMEIRecord | null,
    supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  ): Promise<IMEIRecord | null> {
    if (!imeiRecord || imeiRecord.quoted_price != null || !imeiRecord.order_item_id) {
      return imeiRecord
    }

    const { data: orderItem } = await supabase
      .from('order_items')
      .select('quoted_price, unit_price')
      .eq('id', imeiRecord.order_item_id)
      .single()

    const fallbackQuotedPrice =
      (orderItem as { quoted_price?: number | null; unit_price?: number | null } | null)?.quoted_price
      ?? (orderItem as { quoted_price?: number | null; unit_price?: number | null } | null)?.unit_price
      ?? imeiRecord.quoted_price

    return {
      ...imeiRecord,
      quoted_price: fallbackQuotedPrice ?? undefined,
    }
  }

  private static async syncOrderStatusAfterTriage(
    orderId: string | undefined,
    currentStatus: string | undefined,
    actorId: string,
  ): Promise<void> {
    if (!orderId) return

    let workingStatus = currentStatus as OrderStatus | undefined

    try {
      const serviceRole = createServiceRoleClient()
      const { data: orderRow, error: orderError } = await serviceRole
        .from('orders')
        .select('status')
        .eq('id', orderId)
        .single()

      if (!orderError && orderRow?.status) {
        workingStatus = orderRow.status as OrderStatus
      }

      if (workingStatus === 'received' && OrderService.isValidTransition('received', 'in_triage')) {
        await OrderService.transitionOrder(orderId, 'in_triage', actorId, 'Triage started')
        workingStatus = 'in_triage'
      }

      const summary = await this.checkOrderTriageComplete(orderId)
      if (!summary.isComplete || summary.pending > 0 || summary.needsException > 0) {
        return
      }

      if (workingStatus === 'in_triage' && OrderService.isValidTransition('in_triage', 'qc_complete')) {
        await OrderService.transitionOrder(orderId, 'qc_complete', actorId, 'All devices triaged')
      }
    } catch (error) {
      console.error('[TriageService] Failed to sync order status after triage:', error)
    }
  }

  /**
   * Check if all items in an order have been triaged
   */
  static async checkOrderTriageComplete(orderId: string): Promise<{
    total: number
    complete: number
    pending: number
    needsException: number
    isComplete: boolean
  }> {
    const serviceRole = createServiceRoleClient()
    let lastSummary = {
      total: 0,
      complete: 0,
      pending: 0,
      needsException: 0,
      isComplete: false,
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { data, error } = await serviceRole
        .from('imei_records')
        .select('triage_status')
        .eq('order_id', orderId)

      if (error) {
        throw new Error(error.message)
      }

      const records = data ?? []
      const total = records.length
      // 'rejected' counts as resolved — COE has declined the mismatch claim and
      // processing continues at the original price. Without this, a rejected exception
      // leaves triage_status='rejected' which is neither complete/pending/needsException
      // and the order would be stuck in in_triage forever.
      const complete = records.filter(r => r.triage_status === 'complete' || r.triage_status === 'rejected').length
      const pending = records.filter(r => r.triage_status === 'pending').length
      const needsException = records.filter(r => r.triage_status === 'needs_exception').length

      lastSummary = {
        total,
        complete,
        pending,
        needsException,
        isComplete: total > 0 && complete === total,
      }

      if (lastSummary.isComplete && lastSummary.pending === 0 && lastSummary.needsException === 0) {
        return lastSummary
      }

      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 150))
      }
    }

    return lastSummary
  }
}
