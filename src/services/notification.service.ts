// ============================================================================
// NOTIFICATION SERVICE
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { 
  Notification,
  NotificationType,
  NotificationStatus,
} from '@/types'

export class NotificationService {
  /**
   * Get notifications for a user
   */
  static async getUserNotifications(
    userId: string,
    unreadOnly = false,
    limit = 20
  ): Promise<Notification[]> {
    const supabase = createServerSupabaseClient()

    let query = supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (unreadOnly) {
      query = query.is('read_at', null)
    }

    const { data, error } = await query

    if (error) {
      throw new Error(error.message)
    }

    return data as Notification[]
  }

  /**
   * Get unread notification count
   */
  static async getUnreadCount(userId: string): Promise<number> {
    const supabase = createServerSupabaseClient()

    const { count, error } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null)

    if (error) {
      throw new Error(error.message)
    }

    return count || 0
  }

  /**
   * Create a notification
   */
  static async createNotification(input: {
    user_id: string
    type: NotificationType
    title: string
    message: string
    link?: string
    metadata?: Record<string, any>
  }): Promise<Notification> {
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('notifications')
      .insert({
        ...input,
        status: 'pending',
      })
      .select()
      .single()

    if (error) {
      throw new Error(error.message)
    }

    // If it's an email notification, queue it for sending
    if (input.type === 'email') {
      // TODO: Integrate with email service (SendGrid)
      await this.markAsSent(data.id)
    }

    return data as Notification
  }

  /**
   * Mark notification as read
   */
  static async markAsRead(id: string): Promise<void> {
    const supabase = createServerSupabaseClient()

    const { error } = await supabase
      .from('notifications')
      .update({
        read_at: new Date().toISOString(),
        status: 'read',
      })
      .eq('id', id)

    if (error) {
      throw new Error(error.message)
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  static async markAllAsRead(userId: string): Promise<void> {
    const supabase = createServerSupabaseClient()

    const { error } = await supabase
      .from('notifications')
      .update({
        read_at: new Date().toISOString(),
        status: 'read',
      })
      .eq('user_id', userId)
      .is('read_at', null)

    if (error) {
      throw new Error(error.message)
    }
  }

  /**
   * Mark notification as sent
   */
  private static async markAsSent(id: string): Promise<void> {
    const supabase = createServerSupabaseClient()

    await supabase
      .from('notifications')
      .update({
        sent_at: new Date().toISOString(),
        status: 'sent',
      })
      .eq('id', id)
  }

  // ============================================================================
  // NOTIFICATION HELPERS
  // ============================================================================

  /**
   * Send quote ready notification
   */
  static async sendQuoteReadyNotification(
    userId: string,
    orderId: string,
    orderNumber: string,
    total: number
  ): Promise<void> {
    await this.createNotification({
      user_id: userId,
      type: 'in_app',
      title: 'Quote Ready',
      message: `Your quote for order #${orderNumber} is ready. Total: $${total.toFixed(2)}`,
      link: `/orders/${orderId}`,
      metadata: { order_id: orderId, order_number: orderNumber },
    })
  }

  /**
   * Send order accepted notification
   */
  static async sendOrderAcceptedNotification(
    userId: string,
    orderId: string,
    orderNumber: string
  ): Promise<void> {
    await this.createNotification({
      user_id: userId,
      type: 'in_app',
      title: 'Order Accepted',
      message: `Order #${orderNumber} has been accepted and is being processed.`,
      link: `/orders/${orderId}`,
      metadata: { order_id: orderId, order_number: orderNumber },
    })
  }

  /**
   * Send SLA warning notification
   */
  static async sendSLAWarningNotification(
    userId: string,
    orderId: string,
    orderNumber: string,
    hoursRemaining: number
  ): Promise<void> {
    await this.createNotification({
      user_id: userId,
      type: 'in_app',
      title: '⚠️ SLA Warning',
      message: `Order #${orderNumber} is approaching its SLA deadline. ${hoursRemaining} hours remaining.`,
      link: `/orders/${orderId}`,
      metadata: { order_id: orderId, order_number: orderNumber, type: 'sla_warning' },
    })
  }

  /**
   * Send SLA breach notification
   */
  static async sendSLABreachNotification(
    userId: string,
    orderId: string,
    orderNumber: string
  ): Promise<void> {
    await this.createNotification({
      user_id: userId,
      type: 'in_app',
      title: '🚨 SLA BREACH',
      message: `Order #${orderNumber} has BREACHED its SLA. Immediate action required.`,
      link: `/orders/${orderId}`,
      metadata: { order_id: orderId, order_number: orderNumber, type: 'sla_breach' },
    })
  }

  /**
   * Send order shipped notification
   */
  static async sendOrderShippedNotification(
    userId: string,
    orderId: string,
    orderNumber: string,
    trackingNumber?: string
  ): Promise<void> {
    await this.createNotification({
      user_id: userId,
      type: 'in_app',
      title: '📦 Order Shipped',
      message: `Order #${orderNumber} has shipped!${trackingNumber ? ` Tracking: ${trackingNumber}` : ''}`,
      link: `/orders/${orderId}`,
      metadata: { order_id: orderId, order_number: orderNumber, tracking_number: trackingNumber },
    })
  }
}
