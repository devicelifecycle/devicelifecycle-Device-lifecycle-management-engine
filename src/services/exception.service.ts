// ============================================================================
// EXCEPTION SERVICE - DISCREPANCY TRACKING & APPROVAL WORKFLOW
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { NotificationService } from './notification.service'
import type {
  OrderException,
  DiscrepancyDetails,
  OrderDiscrepancyResponse,
  UserRole,
} from '@/types'

export class ExceptionService {
  /**
   * Get all exceptions for a specific order with details
   */
  static async getOrderExceptions(orderId: string): Promise<OrderDiscrepancyResponse> {
    const supabase = await createServerSupabaseClient()

    // Get order with items
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, total_quantity')
      .eq('id', orderId)
      .single()

    if (orderError || !order) {
      throw new Error(`Order not found: ${orderError?.message || 'Unknown error'}`)
    }

    // Get all exceptions for this order
    const { data: exceptions, error: exError } = await supabase
      .from('order_exceptions')
      .select(`
        *,
        order_item:order_items(*)
      `)
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })

    if (exError) {
      throw new Error(`Failed to fetch exceptions: ${exError.message}`)
    }

    // Get triage results for price/condition details
    const { data: triageResults, error: triageError } = await supabase
      .from('triage_results')
      .select('order_id, claimed_condition, actual_condition, price_adjustment, mismatch_severity, approval_status')
      .eq('order_id', orderId)

    if (triageError) {
      throw new Error(`Failed to fetch triage results: ${triageError.message}`)
    }

    // Build response with detailed discrepancy info
    const discrepancies: DiscrepancyDetails[] = (exceptions || []).map(ex => {
      const triage = triageResults?.find(t => t.order_id === orderId) // Simplified; in reality, need more linking
      // Note: This is simplified. Real implementation would need better joining
      // to match triage results to specific order items
      return {
        exceptionId: ex.id,
        itemId: ex.order_item_id,
        deviceName: ex.summary.split(':')[0] || 'Unknown Device',
        claimedCondition: triage?.claimed_condition || 'unknown',
        actualCondition: triage?.actual_condition || 'unknown',
        priceDifference: triage?.price_adjustment,
        severity: ex.severity,
        type: ex.exception_type,
        approvalStatus: ex.approval_status,
        coeApprovedAt: undefined, // Would be derived from triage_results
        adminApprovedAt: undefined,
        coeNotes: undefined,
        adminNotes: undefined,
      }
    })

    // Count by status
    const summaryByStatus = {
      pending: (exceptions || []).filter(e => e.approval_status === 'pending').length,
      coe_approved: (exceptions || []).filter(e => e.approval_status === 'coe_approved').length,
      admin_approved: (exceptions || []).filter(e => e.approval_status === 'admin_approved').length,
      rejected: (exceptions || []).filter(e => e.approval_status === 'rejected').length,
    }

    const itemsWithDiscrepancies = exceptions?.length || 0
    const discrepancyRate = order.total_quantity > 0
      ? ((itemsWithDiscrepancies / order.total_quantity) * 100).toFixed(1)
      : '0'

    return {
      orderId,
      totalItems: order.total_quantity,
      itemsWithDiscrepancies,
      discrepancyRate: `${discrepancyRate}%`,
      exceptions: discrepancies,
      summaryByStatus,
    }
  }

  /**
   * Get pending exceptions across all orders (for COE dashboard)
   */
  static async getPendingExceptions(filters?: {
    severity?: 'minor' | 'moderate' | 'major';
    limit?: number;
    offset?: number;
  }) {
    const supabase = await createServerSupabaseClient()

    let query = supabase
      .from('order_exceptions')
      .select(`
        *,
        order:orders(id, order_number),
        order_item:order_items(*)
      `)
      .eq('approval_status', 'pending')

    if (filters?.severity) {
      query = query.eq('severity', filters.severity)
    }

    query = query.order('severity', { ascending: false })
      .order('created_at', { ascending: false })

    if (filters?.limit) {
      const offset = filters.offset || 0
      query = query.range(offset, offset + filters.limit - 1)
    } else {
      query = query.limit(50)
    }

    const { data, error } = await query

    if (error) {
      throw new Error(`Failed to fetch pending exceptions: ${error.message}`)
    }

    return data || []
  }

  /**
   * Approve exception by COE
   */
  static async approveByCOE(
    exceptionId: string,
    userId: string,
    notes?: string
  ): Promise<OrderException> {
    const supabase = createServiceRoleClient()

    // Verify user is COE
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single()

    if (userError || !user || !['coe_manager', 'coe_tech'].includes(user.role)) {
      throw new Error('Only COE can approve exceptions')
    }

    // Update exception
    const { data: exception, error } = await supabase
      .from('order_exceptions')
      .update({
        approval_status: 'coe_approved',
        notes: notes || null,
      })
      .eq('id', exceptionId)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to approve exception: ${error.message}`)
    }

    // Update corresponding triage record
    await supabase
      .from('triage_results')
      .update({
        approval_status: 'coe_approved',
        coe_notes: notes || null,
        approved_by_coe_id: userId,
      })
      .match({
        order_item_id: exception.order_item_id,
      })

    // Log timeline event
    await this.logExceptionEvent(
      exception.order_id,
      'Exception Approved by COE',
      `Exception ${exceptionId} approved by COE`,
      userId
    )

    return exception as OrderException
  }

  /**
   * Approve exception by Admin
   */
  static async approveByAdmin(
    exceptionId: string,
    userId: string,
    override?: boolean,
    notes?: string
  ): Promise<OrderException> {
    const supabase = createServiceRoleClient()

    // Verify user is Admin
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single()

    if (userError || !user || user.role !== 'admin') {
      throw new Error('Only admin can approve exceptions')
    }

    // Get current exception
    const { data: currentException, error: getError } = await supabase
      .from('order_exceptions')
      .select('*')
      .eq('id', exceptionId)
      .single()

    if (getError || !currentException) {
      throw new Error('Exception not found')
    }

    // If not override, verify COE already approved
    if (!override && currentException.approval_status !== 'coe_approved') {
      throw new Error('COE must approve before admin approval (unless override is used)')
    }

    // Update exception
    const { data: exception, error } = await supabase
      .from('order_exceptions')
      .update({
        approval_status: override ? 'overridden' : 'admin_approved',
        notes: notes || null,
      })
      .eq('id', exceptionId)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to approve exception: ${error.message}`)
    }

    // Update corresponding triage record
    await supabase
      .from('triage_results')
      .update({
        approval_status: override ? 'overridden' : 'admin_approved',
        admin_notes: notes || null,
        approved_by_admin_id: userId,
        approved_at: new Date().toISOString(),
      })
      .match({
        order_item_id: exception.order_item_id,
      })

    // Log timeline event
    await this.logExceptionEvent(
      exception.order_id,
      override ? 'Exception Overridden by Admin' : 'Exception Approved by Admin',
      `Exception ${exceptionId} ${override ? 'overridden' : 'approved'} by admin`,
      userId
    )

    return exception as OrderException
  }

  /**
   * Reject exception
   */
  static async rejectException(
    exceptionId: string,
    userId: string,
    reason: string
  ): Promise<OrderException> {
    const supabase = createServiceRoleClient()

    if (!reason || reason.trim().length === 0) {
      throw new Error('Rejection reason required')
    }

    // Update exception
    const { data: exception, error } = await supabase
      .from('order_exceptions')
      .update({
        approval_status: 'rejected',
        notes: reason,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', exceptionId)
      .select()
      .single()

    if (error) {
      throw new Error(`Failed to reject exception: ${error.message}`)
    }

    // Update corresponding triage record
    await supabase
      .from('triage_results')
      .update({
        approval_status: 'rejected',
        exception_notes: reason,
      })
      .match({
        order_item_id: exception.order_item_id,
      })

    // Log timeline event
    await this.logExceptionEvent(
      exception.order_id,
      'Exception Rejected',
      `Exception ${exceptionId} rejected: ${reason}`,
      userId
    )

    // Notify order owner of rejection
    await this.notifyExceptionRejection(exception.order_id, reason)

    return exception as OrderException
  }

  /**
   * Get discrepancy statistics
   */
  static async getDiscrepancyStats(filters?: {
    dateFrom?: string;
    dateTo?: string;
    orderType?: 'trade_in' | 'cpo';
  }) {
    const supabase = await createServerSupabaseClient()

    let query = supabase
      .from('order_exceptions')
      .select('severity, approval_status, exception_type, created_at')

    if (filters?.dateFrom) {
      query = query.gte('created_at', filters.dateFrom)
    }

    if (filters?.dateTo) {
      query = query.lte('created_at', filters.dateTo)
    }

    const { data: exceptions, error } = await query

    if (error) {
      throw new Error(`Failed to fetch discrepancy stats: ${error.message}`)
    }

    // Aggregate stats
    const stats = {
      total: exceptions?.length || 0,
      bySeverity: {
        major: 0,
        moderate: 0,
        minor: 0,
      },
      byStatus: {
        pending: 0,
        coe_approved: 0,
        admin_approved: 0,
        rejected: 0,
      },
      byType: {} as Record<string, number>,
      approvalRate: 0,
    }

    for (const ex of exceptions || []) {
      stats.bySeverity[ex.severity as keyof typeof stats.bySeverity]++
      stats.byStatus[ex.approval_status as keyof typeof stats.byStatus]++
      stats.byType[ex.exception_type] = (stats.byType[ex.exception_type] || 0) + 1
    }

    const approved = stats.byStatus.coe_approved + stats.byStatus.admin_approved
    stats.approvalRate = stats.total > 0 ? (approved / stats.total) * 100 : 0

    return stats
  }

  /**
   * Check if order can proceed (all exceptions resolved)
   */
  static async canOrderProceed(orderId: string): Promise<boolean> {
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('order_exceptions')
      .select('id')
      .eq('order_id', orderId)
      .eq('approval_status', 'pending')
      .limit(1)

    if (error) return false

    return !data || data.length === 0
  }

  /**
   * Log exception event to order timeline
   */
  private static async logExceptionEvent(
    orderId: string,
    eventName: string,
    description: string,
    userId: string
  ): Promise<void> {
    const supabase = createServiceRoleClient()

    // Create OrderService import would be needed for this; for now, simple insert
    const { error } = await supabase
      .from('order_timeline')
      .insert({
        order_id: orderId,
        event_name: eventName,
        description,
        actor_id: userId,
        metadata: { exception_event: true },
      })

    if (error) {
      console.error('Failed to log exception event:', error)
    }
  }

  /**
   * Notify order owner about exception rejection
   */
  private static async notifyExceptionRejection(
    orderId: string,
    reason: string
  ): Promise<void> {
    try {
      const supabase = createServiceRoleClient()

      const { data: order } = await supabase
        .from('orders')
        .select('id, order_number, created_by_id, customer_id')
        .eq('id', orderId)
        .single()

      if (!order) return

      // Notify via NotificationService
      const message = `Exception rejected for Order #${order.order_number}: ${reason}`
      
      // Notify order creator
      if (order.created_by_id) {
        await NotificationService.createNotification({
          user_id: order.created_by_id,
          type: 'in_app',
          title: 'Exception Rejected',
          message,
          link: `/orders/${orderId}`,
          metadata: { order_id: orderId, order_number: order.order_number },
        }).catch(err => console.error('Failed to notify:', err))
      }
    } catch (err) {
      console.error('Error notifying exception rejection:', err)
    }
  }
}
