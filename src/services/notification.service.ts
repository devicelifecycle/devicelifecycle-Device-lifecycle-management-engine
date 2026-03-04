// ============================================================================
// NOTIFICATION SERVICE
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { EmailService } from '@/services/email.service'
import { ORDER_EMAIL_CONFIG } from '@/lib/constants'
import type {
  Notification,
  NotificationType,
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
   * Create a notification (in-app or email)
   */
  static async createNotification(input: {
    user_id: string
    type: NotificationType
    title: string
    message: string
    link?: string
    metadata?: Record<string, unknown>
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

    // If it's an email notification, send via Resend
    if (input.type === 'email' && input.metadata?.email) {
      const sent = await EmailService.sendEmail(
        input.metadata.email as string,
        input.title,
        input.message
      )
      if (sent) {
        await this.markAsSent(data.id)
      }
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
  // ORDER TRANSITION NOTIFICATIONS
  // ============================================================================

  /**
   * Send email + in-app notifications when an order transitions status.
   * Looks up recipients from the order's related records and sends based on config.
   * Never throws — errors are logged silently.
   */
  static async sendOrderTransitionNotifications(
    order: {
      id: string
      order_number: string
      customer_id?: string
      vendor_id?: string
      assigned_to_id?: string
      created_by_id: string
    },
    fromStatus: string,
    toStatus: string
  ): Promise<void> {
    const config = ORDER_EMAIL_CONFIG[toStatus]
    if (!config) return // No notification configured for this status

    const supabase = createServerSupabaseClient()
    const { subject, message } = config
    const subjectText = subject(order.order_number)
    const messageText = message(order.order_number)
    const orderLink = `/orders/${order.id}`

    // Collect email recipients in parallel
    const emailTargets: Array<{ email: string; name: string; userId?: string }> = []

    const lookups: Promise<void>[] = []

    // Customer
    if (config.customer && order.customer_id) {
      lookups.push((async () => {
        const { data } = await supabase
          .from('customers')
          .select('contact_email, contact_name')
          .eq('id', order.customer_id!)
          .single()
        if (data?.contact_email) {
          emailTargets.push({ email: data.contact_email, name: data.contact_name || 'Customer' })
        }
      })())
    }

    // Vendor
    if (config.vendor && order.vendor_id) {
      lookups.push((async () => {
        const { data } = await supabase
          .from('vendors')
          .select('contact_email, contact_name')
          .eq('id', order.vendor_id!)
          .single()
        if (data?.contact_email) {
          emailTargets.push({ email: data.contact_email, name: data.contact_name || 'Vendor' })
        }
      })())
    }

    // Assigned user
    if (config.assigned && order.assigned_to_id) {
      lookups.push((async () => {
        const { data } = await supabase
          .from('users')
          .select('id, email, full_name')
          .eq('id', order.assigned_to_id!)
          .single()
        if (data?.email) {
          emailTargets.push({ email: data.email, name: data.full_name || 'Team Member', userId: data.id })
        }
      })())
    }

    // Admin users (all active admins)
    if (config.admin) {
      lookups.push((async () => {
        const { data } = await supabase
          .from('users')
          .select('id, email, full_name')
          .eq('role', 'admin')
          .eq('is_active', true)
        if (data) {
          for (const admin of data) {
            emailTargets.push({ email: admin.email, name: admin.full_name || 'Admin', userId: admin.id })
          }
        }
      })())
    }

    await Promise.all(lookups)

    // Deduplicate by email
    const seen = new Set<string>()
    const uniqueTargets = emailTargets.filter(t => {
      if (seen.has(t.email)) return false
      seen.add(t.email)
      return true
    })

    // Send emails + create in-app notifications in parallel
    const sends: Promise<void>[] = []

    for (const target of uniqueTargets) {
      // Send email
      sends.push(
        EmailService.sendOrderStatusEmail({
          to: target.email,
          recipientName: target.name,
          orderNumber: order.order_number,
          orderId: order.id,
          fromStatus,
          toStatus,
          subject: subjectText,
          message: messageText,
        }).then(() => {})
      )

      // Create in-app notification for users with accounts
      if (target.userId) {
        sends.push(
          this.createNotification({
            user_id: target.userId,
            type: 'in_app',
            title: subjectText,
            message: messageText,
            link: orderLink,
            metadata: { order_id: order.id, order_number: order.order_number, from_status: fromStatus, to_status: toStatus },
          }).then(() => {}).catch(() => {})
        )
      }
    }

    await Promise.all(sends)
  }

  // ============================================================================
  // LEGACY NOTIFICATION HELPERS (kept for backward compatibility)
  // ============================================================================

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

  static async sendSLAWarningNotification(
    userId: string,
    orderId: string,
    orderNumber: string,
    hoursRemaining: number
  ): Promise<void> {
    await this.createNotification({
      user_id: userId,
      type: 'in_app',
      title: 'SLA Warning',
      message: `Order #${orderNumber} is approaching its SLA deadline. ${hoursRemaining} hours remaining.`,
      link: `/orders/${orderId}`,
      metadata: { order_id: orderId, order_number: orderNumber, type: 'sla_warning' },
    })
  }

  static async sendSLABreachNotification(
    userId: string,
    orderId: string,
    orderNumber: string
  ): Promise<void> {
    await this.createNotification({
      user_id: userId,
      type: 'in_app',
      title: 'SLA BREACH',
      message: `Order #${orderNumber} has BREACHED its SLA. Immediate action required.`,
      link: `/orders/${orderId}`,
      metadata: { order_id: orderId, order_number: orderNumber, type: 'sla_breach' },
    })
  }

  /**
   * Send SLA warning/breach via email (in addition to in-app).
   * Looks up the user's email and sends a branded SLA alert email.
   */
  static async sendSLAEmailNotification(
    userId: string,
    orderId: string,
    orderNumber: string,
    severity: 'warning' | 'breach',
    hoursRemaining?: number
  ): Promise<void> {
    try {
      const supabase = createServerSupabaseClient()
      const { data: user } = await supabase
        .from('users')
        .select('email, full_name')
        .eq('id', userId)
        .single()

      if (!user?.email) return

      const subject = severity === 'breach'
        ? `[URGENT] SLA Breach — Order #${orderNumber}`
        : `SLA Warning — Order #${orderNumber}`

      const message = severity === 'breach'
        ? `Order #${orderNumber} has BREACHED its SLA deadline. Immediate action is required.`
        : `Order #${orderNumber} is approaching its SLA deadline. ${hoursRemaining} hours remaining.`

      await EmailService.sendOrderStatusEmail({
        to: user.email,
        recipientName: user.full_name || 'Team Member',
        orderNumber,
        orderId,
        fromStatus: '',
        toStatus: severity === 'breach' ? 'SLA Breach' : 'SLA Warning',
        subject,
        message,
      })
    } catch (err) {
      console.error('[NotificationService] SLA email failed:', err)
    }
  }

  static async sendOrderShippedNotification(
    userId: string,
    orderId: string,
    orderNumber: string,
    trackingNumber?: string
  ): Promise<void> {
    await this.createNotification({
      user_id: userId,
      type: 'in_app',
      title: 'Order Shipped',
      message: `Order #${orderNumber} has shipped!${trackingNumber ? ` Tracking: ${trackingNumber}` : ''}`,
      link: `/orders/${orderId}`,
      metadata: { order_id: orderId, order_number: orderNumber, tracking_number: trackingNumber },
    })
  }
}
