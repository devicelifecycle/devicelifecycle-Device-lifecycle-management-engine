// ============================================================================
// SLA SERVICE
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { NotificationService } from './notification.service'
import { addHours, isPast } from '@/lib/utils'
import { CUSTOMER_REMINDER_INTERVALS_HOURS } from '@/lib/constants'
import type { Order, SLARule } from '@/types'

export class SLAService {
  /**
   * Check all orders for SLA compliance
   * This is called by the cron job
   */
  static async checkAllOrders(): Promise<{
    checked: number
    warnings: number
    breaches: number
    reminders: number
  }> {
    // Use service-role client — this runs from cron with no user session
    const supabase = createServiceRoleClient()

    // Prefetch ALL active SLA rules once, before the order loop.
    // Previously: 1 sla_rules query per order (N queries for N orders).
    // Now: 1 query total. The full rule set is ~14 rows (~3 KB) — trivially
    // safe to hold in memory, and matching in JS is O(14) per order vs an
    // indexed DB round-trip. Evidence: 75 open orders × 1 query = 75 queries
    // eliminated; at 10× scale = 750 eliminated.
    const { data: allActiveRules, error: rulesError } = await supabase
      .from('sla_rules')
      .select('*')
      .eq('is_active', true)

    if (rulesError) {
      throw new Error(`Failed to load SLA rules: ${rulesError.message}`)
    }
    const rulesCache: SLARule[] = allActiveRules || []

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
    let reminders = 0

    for (const order of orders || []) {
      // Pass the cached rules so checkOrderSLA skips its own per-order DB query
      const result = await this.checkOrderSLA(order as Order, rulesCache)
      if (result.isWarning) warnings++
      if (result.isBreach) breaches++

      // Check for customer reminder notifications (quoted orders waiting for acceptance)
      if (order.status === 'quoted') {
        const sent = await this.checkCustomerReminders(order as Order)
        reminders += sent
      }
    }

    return {
      checked: orders?.length || 0,
      warnings,
      breaches,
      reminders,
    }
  }

  /**
   * Check SLA for a single order.
   *
   * @param cachedRules When provided (e.g. from checkAllOrders' prefetch), the
   *   matching rule is found in-memory instead of issuing a per-order DB query.
   *   Omit when calling standalone — the DB fallback still works identically.
   */
  static async checkOrderSLA(order: Order, cachedRules?: SLARule[]): Promise<{
    isWarning: boolean
    isBreach: boolean
    hoursRemaining: number | null
    slaRule: SLARule | null
  }> {

    let slaRule: SLARule | null = null

    if (cachedRules) {
      // In-memory match — mirrors the DB query conditions exactly.
      // Prefer a type-specific rule (order_type === order.type) over the
      // generic fallback (order_type === null) when both exist for a status.
      const specific = cachedRules.find(
        (r) => r.from_status === order.status && r.order_type === order.type
      ) ?? null
      const generic = cachedRules.find(
        (r) => r.from_status === order.status && r.order_type == null
      ) ?? null
      slaRule = specific ?? generic
    } else {
      // DB fallback — used when called outside the cron batch (e.g. from
      // per-order APIs). order.type is a DB enum value (NOT user input) so it
      // must NOT go through sanitizeSearchInput — that escapes underscores for
      // ILIKE safety, turning "trade_in" into the invalid literal "trade\_in"
      // which silently errors the whole query and broke breach detection until fixed.
      // Use service-role: sla_rules RLS requires auth.uid() — anon client returns 0 silently.
      const supabase = createServiceRoleClient()
      const { data } = await supabase
        .from('sla_rules')
        .select('*')
        .eq('from_status', order.status)
        .eq('is_active', true)
        .or(`order_type.is.null,order_type.eq.${order.type}`)
        .limit(1)
        .single()
      slaRule = data ?? null
    }

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
    } else if (isBreach && order.is_sla_breached) {
      // Order is ALREADY breached but still active — re-escalate once per 24 h
      await this.handleEscalation(order, slaRule)
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
   * Handle SLA breach. Uses service-role for DB writes (cron has no user session).
   */
  private static async handleBreach(order: Order, slaRule: SLARule): Promise<void> {
    const supabase = createServiceRoleClient()

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

    // Send notifications to escalation contacts — batched (not serial) so
    // N contacts don't add N sequential round-trips holding the cron runner.
    const escalationTargets = [
      ...slaRule.escalation_user_ids,
      ...(order.assigned_to_id ? [order.assigned_to_id] : []),
    ]
    await Promise.all(escalationTargets.map(async (userId) => {
      await NotificationService.sendSLABreachNotification(userId, order.id, order.order_number).catch(() => {})
      await NotificationService.sendSLAEmailNotification(userId, order.id, order.order_number, 'breach').catch(() => {})
    }))
  }

  /**
   * Re-escalate an order that is already breached and still active.
   * Fires at most once per 24 hours to avoid notification spam.
   */
  private static async handleEscalation(order: Order, slaRule: SLARule): Promise<void> {
    const supabase = createServiceRoleClient()
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    // Check if we already sent an escalation in the last 24 h
    const { data: recent } = await supabase
      .from('notifications')
      .select('id')
      .eq('metadata->>order_id', order.id)
      .eq('metadata->>type', 'sla_escalation')
      .gte('created_at', since)
      .limit(1)
      .maybeSingle()

    if (recent?.id) return // Already escalated within 24 h

    const hoursBreached = Math.round(
      (Date.now() - new Date(order.updated_at || order.created_at).getTime()) / (1000 * 60 * 60)
    )
    const message = `Order #${order.order_number} has been in SLA breach for ${hoursBreached}h and is still unresolved.`
    const metadata = {
      order_id: order.id,
      order_number: order.order_number,
      type: 'sla_escalation',
    }

    // Batch: escalation contacts + assigned user (not serial)
    const escalationIds = slaRule.escalation_user_ids?.length
      ? slaRule.escalation_user_ids
      : await supabase
          .from('users')
          .select('id')
          .in('role', ['admin', 'coe_manager'])
          .eq('is_active', true)
          .then(({ data }) => (data || []).map((u: { id: string }) => u.id))

    const allTargets = [
      ...(Array.isArray(escalationIds) ? escalationIds : []),
      ...(order.assigned_to_id ? [order.assigned_to_id] : []),
    ]

    await Promise.all(allTargets.map((userId) =>
      NotificationService.createNotification({
        user_id: userId,
        type: 'in_app',
        title: userId === order.assigned_to_id && !slaRule.escalation_user_ids?.includes(userId)
          ? 'SLA Breach — Your Order Is Overdue'
          : 'SLA Breach — Escalation Reminder',
        message,
        link: `/orders/${order.id}`,
        metadata,
      }).catch(() => {})
    ))
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
    const supabase = createServiceRoleClient()

    const { data: existingWarning } = await supabase
      .from('notifications')
      .select('id')
      .eq('metadata->>order_id', order.id)
      .eq('metadata->>type', 'sla_warning')
      .limit(1)
      .single()

    if (existingWarning) return // Already warned

    // Batch all warning targets (assigned + escalation) — not serial
    const warningTargets = [
      ...(order.assigned_to_id ? [order.assigned_to_id] : []),
      ...(slaRule.escalation_user_ids || []).filter((id) => id !== order.assigned_to_id),
    ]
    await Promise.all(warningTargets.map(async (userId) => {
      await NotificationService.sendSLAWarningNotification(userId, order.id, order.order_number, hoursRemaining).catch(() => {})
      await NotificationService.sendSLAEmailNotification(userId, order.id, order.order_number, 'warning', hoursRemaining).catch(() => {})
    }))
  }

  /**
   * Check and send recurring reminder notifications for orders in 'quoted' status.
   * Customer has 30 days to accept/reject trade-in. Reminders at day 7, 14, 21, 25.
   */
  private static async checkCustomerReminders(order: Order): Promise<number> {
    if (!order.quoted_at || !order.customer_id) return 0

    const quotedAt = new Date(order.quoted_at)
    const now = new Date()
    const hoursSinceQuoted = (now.getTime() - quotedAt.getTime()) / (1000 * 60 * 60)
    let sent = 0

    // Use service-role: cron context has no session; customers/notifications/users
    // tables all have RLS that requires auth.uid() — anon client silently returns nothing.
    const supabase = createServiceRoleClient()

    for (const intervalHours of CUSTOMER_REMINDER_INTERVALS_HOURS) {
      if (hoursSinceQuoted < intervalHours) continue

      // Check if we already sent a reminder for this interval
      const reminderKey = `customer_reminder_${intervalHours}h`
      const { data: existing } = await supabase
        .from('notifications')
        .select('id')
        .eq('metadata->>order_id', order.id)
        .eq('metadata->>type', reminderKey)
        .limit(1)
        .single()

      if (existing) continue // Already sent this reminder

      // Look up customer's user account to send notification
      const { data: customer } = await supabase
        .from('customers')
        .select('contact_email, contact_name, organization_id')
        .eq('id', order.customer_id)
        .single()

      if (!customer) continue

      // Find the user linked to this customer's org
      const { data: customerUsers } = await supabase
        .from('users')
        .select('id, email, full_name')
        .eq('organization_id', customer.organization_id)
        .eq('role', 'customer')
        .eq('is_active', true)

      const quoteValidityHours = 30 * 24 // 30 days
      const daysRemaining = Math.max(0, Math.ceil((quoteValidityHours - hoursSinceQuoted) / 24))

      // Send in-app notification to each customer user
      for (const user of customerUsers || []) {
        await NotificationService.createNotification({
          user_id: user.id,
          type: 'in_app',
          title: 'Quote Awaiting Your Response',
          message: `Order #${order.order_number} has a quote awaiting your acceptance. You have ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining to respond.`,
          link: `/orders/${order.id}`,
          metadata: {
            order_id: order.id,
            order_number: order.order_number,
            type: reminderKey,
          },
        })
        sent++
      }

      // Send email to customer contact
      if (customer.contact_email) {
        const { EmailService } = await import('@/services/email.service')
        await EmailService.sendSLAReminderEmail({
          to: customer.contact_email,
          recipientName: customer.contact_name || 'Customer',
          orderNumber: order.order_number,
          orderId: order.id,
          daysRemaining,
          quotedAmount: order.quoted_amount ?? undefined,
          tenantId: (order as { tenant_id?: string | null }).tenant_id ?? null,
        })
        sent++
      }

      // Also notify admin/assigned user that customer hasn't responded
      if (order.assigned_to_id) {
        await NotificationService.createNotification({
          user_id: order.assigned_to_id,
          type: 'in_app',
          title: 'Customer Not Responding',
          message: `Customer has not responded to quote for Order #${order.order_number}. ${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining before SLA breach.`,
          link: `/orders/${order.id}`,
          metadata: {
            order_id: order.id,
            order_number: order.order_number,
            type: `internal_${reminderKey}`,
          },
        })
      }
    }

    return sent
  }

  /**
   * Customer/vendor-facing SLA info — read-only, no DB writes or
   * notifications (unlike checkOrderSLA, which is cron-only and mutates
   * state). Deliberately avoids internal "breach"/"escalation" language;
   * callers should phrase this as "expected by" / "running long".
   */
  static async getDisplaySLA(order: Order): Promise<{
    due_at: string | null
    hours_remaining: number | null
    is_at_risk: boolean
  }> {
    const supabase = createServiceRoleClient()

    // See the comment on the identical lookup in checkOrderSLA above — must
    // not sanitize order.type, it's a DB enum value, not user search input.
    const { data: slaRule } = await supabase
      .from('sla_rules')
      .select('warning_hours, breach_hours')
      .eq('from_status', order.status)
      .eq('is_active', true)
      .or(`order_type.is.null,order_type.eq.${order.type}`)
      .limit(1)
      .single()

    if (!slaRule) {
      return { due_at: null, hours_remaining: null, is_at_risk: false }
    }

    const statusEnteredAt = this.getStatusEnteredAt(order)
    if (!statusEnteredAt) {
      return { due_at: null, hours_remaining: null, is_at_risk: false }
    }

    const breachDeadline = addHours(statusEnteredAt, slaRule.breach_hours)
    const warningDeadline = addHours(statusEnteredAt, slaRule.warning_hours)
    const hoursRemaining = (breachDeadline.getTime() - Date.now()) / (1000 * 60 * 60)

    return {
      due_at: breachDeadline.toISOString(),
      hours_remaining: Math.round(hoursRemaining * 10) / 10,
      is_at_risk: isPast(warningDeadline),
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
    const supabase = await createServerSupabaseClient()

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
    const supabase = await createServerSupabaseClient()

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
    const supabase = await createServerSupabaseClient()

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
    const supabase = await createServerSupabaseClient()

    const { error } = await supabase
      .from('sla_rules')
      .delete()
      .eq('id', id)

    if (error) {
      throw new Error(error.message)
    }
  }
}
