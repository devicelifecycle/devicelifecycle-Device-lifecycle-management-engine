// ============================================================================
// SLA SERVICE
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { NotificationService } from './notification.service'
import { addHours, isPast, sanitizeSearchInput } from '@/lib/utils'
import type { Order, SLARule, OrderStatus } from '@/types'

export class SLAService {
  /**
   * Check all orders for SLA compliance
   * This is called by the cron job
   */
  static async checkAllOrders(): Promise<{
    checked: number
    warnings: number
    breaches: number
  }> {
    const supabase = createServerSupabaseClient()

    // Get all open orders (not closed or cancelled)
    const { data: orders, error } = await supabase
      .from('orders')
      .select('*')
      .not('status', 'in', '(closed,cancelled,rejected)')

    if (error) {
      throw new Error(error.message)
    }

    let warnings = 0
    let breaches = 0

    for (const order of orders || []) {
      const result = await this.checkOrderSLA(order as Order)
      if (result.isWarning) warnings++
      if (result.isBreach) breaches++
    }

    return {
      checked: orders?.length || 0,
      warnings,
      breaches,
    }
  }

  /**
   * Check SLA for a single order
   */
  static async checkOrderSLA(order: Order): Promise<{
    isWarning: boolean
    isBreach: boolean
    hoursRemaining: number | null
    slaRule: SLARule | null
  }> {
    const supabase = createServerSupabaseClient()

    // Get applicable SLA rule
    const { data: slaRule } = await supabase
      .from('sla_rules')
      .select('*')
      .eq('from_status', order.status)
      .eq('is_active', true)
      .or(`order_type.is.null,order_type.eq.${sanitizeSearchInput(order.type)}`)
      .limit(1)
      .single()

    if (!slaRule) {
      return { isWarning: false, isBreach: false, hoursRemaining: null, slaRule: null }
    }

    // Calculate time in current status
    const statusEnteredAt = this.getStatusEnteredAt(order)
    if (!statusEnteredAt) {
      return { isWarning: false, isBreach: false, hoursRemaining: null, slaRule }
    }

    const warningDeadline = addHours(statusEnteredAt, slaRule.warning_hours)
    const breachDeadline = addHours(statusEnteredAt, slaRule.breach_hours)
    const now = new Date()

    const hoursRemaining = (breachDeadline.getTime() - now.getTime()) / (1000 * 60 * 60)
    const isBreach = isPast(breachDeadline)
    const isWarning = !isBreach && isPast(warningDeadline)

    // Handle breach
    if (isBreach && !order.is_sla_breached) {
      await this.handleBreach(order, slaRule)
    }

    // Handle warning
    if (isWarning && !isBreach) {
      await this.handleWarning(order, slaRule, Math.ceil(hoursRemaining))
    }

    return {
      isWarning,
      isBreach,
      hoursRemaining: Math.ceil(hoursRemaining),
      slaRule,
    }
  }

  /**
   * Handle SLA breach
   */
  private static async handleBreach(order: Order, slaRule: SLARule): Promise<void> {
    const supabase = createServerSupabaseClient()

    // Mark order as breached
    await supabase
      .from('orders')
      .update({ is_sla_breached: true })
      .eq('id', order.id)

    // Record breach
    await supabase.from('sla_breaches').insert({
      order_id: order.id,
      sla_rule_id: slaRule.id,
      breached_at: new Date().toISOString(),
      notification_sent: true,
    })

    // Send notifications to escalation contacts
    for (const userId of slaRule.escalation_user_ids) {
      await NotificationService.sendSLABreachNotification(
        userId,
        order.id,
        order.order_number
      )
    }

    // Also notify assigned user
    if (order.assigned_to_id) {
      await NotificationService.sendSLABreachNotification(
        order.assigned_to_id,
        order.id,
        order.order_number
      )
    }
  }

  /**
   * Handle SLA warning
   */
  private static async handleWarning(
    order: Order, 
    slaRule: SLARule,
    hoursRemaining: number
  ): Promise<void> {
    // Check if we already sent a warning for this order/status
    const supabase = createServerSupabaseClient()

    const { data: existingWarning } = await supabase
      .from('notifications')
      .select('id')
      .eq('metadata->>order_id', order.id)
      .eq('metadata->>type', 'sla_warning')
      .limit(1)
      .single()

    if (existingWarning) return // Already warned

    // Send warning to assigned user
    if (order.assigned_to_id) {
      await NotificationService.sendSLAWarningNotification(
        order.assigned_to_id,
        order.id,
        order.order_number,
        hoursRemaining
      )
    }

    // Send to escalation contacts
    for (const userId of slaRule.escalation_user_ids) {
      await NotificationService.sendSLAWarningNotification(
        userId,
        order.id,
        order.order_number,
        hoursRemaining
      )
    }
  }

  /**
   * Get when order entered current status
   */
  private static getStatusEnteredAt(order: Order): Date | null {
    switch (order.status) {
      case 'draft':
        return new Date(order.created_at)
      case 'submitted':
        return order.submitted_at ? new Date(order.submitted_at) : null
      case 'quoted':
        return order.quoted_at ? new Date(order.quoted_at) : null
      case 'accepted':
        return order.accepted_at ? new Date(order.accepted_at) : null
      case 'shipped':
        return order.shipped_at ? new Date(order.shipped_at) : null
      case 'received':
        return order.received_at ? new Date(order.received_at) : null
      default:
        return new Date(order.updated_at)
    }
  }

  // ============================================================================
  // SLA RULES CRUD
  // ============================================================================

  /**
   * Get all SLA rules
   */
  static async getSLARules(): Promise<SLARule[]> {
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('sla_rules')
      .select('*')
      .order('from_status', { ascending: true })

    if (error) {
      throw new Error(error.message)
    }

    return data as SLARule[]
  }

  /**
   * Create an SLA rule
   */
  static async createSLARule(input: Omit<SLARule, 'id' | 'created_at' | 'updated_at'>): Promise<SLARule> {
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('sla_rules')
      .insert(input)
      .select()
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return data as SLARule
  }

  /**
   * Update an SLA rule
   */
  static async updateSLARule(id: string, input: Partial<SLARule>): Promise<SLARule> {
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('sla_rules')
      .update({
        ...input,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return data as SLARule
  }

  /**
   * Delete an SLA rule
   */
  static async deleteSLARule(id: string): Promise<void> {
    const supabase = createServerSupabaseClient()

    const { error } = await supabase
      .from('sla_rules')
      .delete()
      .eq('id', id)

    if (error) {
      throw new Error(error.message)
    }
  }
}
