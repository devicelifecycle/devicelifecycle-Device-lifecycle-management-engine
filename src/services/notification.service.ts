// ============================================================================
// NOTIFICATION SERVICE
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { getAppPath } from '@/lib/app-url'
import { EmailService } from '@/services/email.service'
import { ORDER_EMAIL_CONFIG } from '@/lib/constants'
import type {
  Notification,
  NotificationType,
} from '@/types'

export class NotificationService {
  private static buildSmsText(...parts: Array<string | undefined | null>): string {
    return parts
      .filter((part): part is string => Boolean(part && part.trim()))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 160)
  }

  private static async sendSmsIfConfigured(phone: string | undefined | null, message: string): Promise<boolean> {
    if (!phone || !EmailService.isTwilioConfigured()) return false

    try {
      return await EmailService.sendSMS(phone, message)
    } catch (error) {
      console.error('[NotificationService] SMS send failed:', error)
      return false
    }
  }

  /**
   * Get notifications for a user
   */
  static async getUserNotifications(
    userId: string,
    unreadOnly = false,
    limit = 20
  ): Promise<Notification[]> {
    const supabase = await createServerSupabaseClient()

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
    const supabase = await createServerSupabaseClient()

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
    const supabase = createServiceRoleClient()
    const metadata = { ...(input.metadata || {}), ...(input.link ? { link: input.link } : {}) }
    const { data, error } = await supabase
      .from('notifications')
      .insert({
        user_id: input.user_id,
        type: input.type,
        title: input.title,
        message: input.message,
        metadata,
        is_read: false,
      })
      .select()
      .single()

    if (error) {
      throw new Error(error.message)
    }
    if (!data) {
      throw new Error('Notification insert did not return data')
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
    const supabase = await createServerSupabaseClient()

    const { error } = await supabase
      .from('notifications')
      .update({
        read_at: new Date().toISOString(),
        is_read: true,
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
    const supabase = await createServerSupabaseClient()

    const { error } = await supabase
      .from('notifications')
      .update({
        read_at: new Date().toISOString(),
        is_read: true,
      })
      .eq('user_id', userId)
      .eq('is_read', false)

    if (error) {
      throw new Error(error.message)
    }
  }

  /**
   * Mark notification as sent
   */
  private static async markAsSent(_id: string): Promise<void> {
    // Email was sent via Resend; in-app notification record exists
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
      type?: string
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

    const supabase = createServiceRoleClient()
    const { subject, message } = config
    const subjectText = subject(order.order_number)
    const messageText = message(order.order_number)
    const orderLink = `/orders/${order.id}`

    // Collect email recipients in parallel
    const emailTargets: Array<{ email: string; name: string; userId?: string }> = []
    const smsTargets: Array<{ phone: string; name: string }> = []

    const lookups: Promise<void>[] = []

    // In-app notification recipients (separate from email — org users may not have real email)
    const inAppUserIds = new Set<string>()

    // Customer — email to contact + in-app to users in customer's organization
    if (config.customer && order.customer_id) {
      lookups.push((async () => {
        const { data: cust } = await supabase
          .from('customers')
          .select('contact_email, contact_name, organization_id')
          .eq('id', order.customer_id!)
          .single()
        if (cust?.contact_email) {
          emailTargets.push({ email: cust.contact_email, name: cust.contact_name || 'Customer' })
        }
        if (cust?.organization_id) {
          const { data: orgUsers } = await supabase
            .from('users')
            .select('id, email, full_name, notification_email')
            .eq('organization_id', cust.organization_id)
            .eq('is_active', true)
          ;(orgUsers || []).forEach(u => {
            inAppUserIds.add(u.id)
            const effectiveEmail = (u as { email?: string; notification_email?: string | null }).email?.endsWith('@login.local')
              ? (u as { notification_email?: string | null }).notification_email
              : (u as { email?: string }).email
            if (effectiveEmail) {
              emailTargets.push({ email: effectiveEmail, name: (u as { full_name?: string }).full_name || 'User', userId: (u as { id: string }).id })
            }
          })
        }
      })())
    }

    // Vendor — either assigned vendor OR broadcast to all vendors (CPO order, no vendor yet)
    const isCpoBroadcast =
      order.type === 'cpo' &&
      !order.vendor_id &&
      (toStatus === 'accepted' || toStatus === 'sourcing')

    if (config.vendor) {
      if (order.vendor_id) {
        lookups.push((async () => {
          const { data: vendor } = await supabase
          .from('vendors')
            .select('contact_email, contact_phone, contact_name, organization_id')
            .eq('id', order.vendor_id!)
            .single()
          if (vendor?.contact_email) {
            emailTargets.push({ email: vendor.contact_email, name: vendor.contact_name || 'Vendor' })
          }
          if (vendor?.contact_phone) {
            smsTargets.push({ phone: vendor.contact_phone, name: vendor.contact_name || 'Vendor' })
          }
          if (vendor?.organization_id) {
            const { data: orgUsers } = await supabase
              .from('users')
              .select('id, email, full_name, notification_email')
              .eq('organization_id', vendor.organization_id)
              .eq('is_active', true)
            ;(orgUsers || []).forEach(u => {
              inAppUserIds.add(u.id)
              const uu = u as { email?: string; notification_email?: string | null; full_name?: string; id: string }
              const effectiveEmail = uu.email?.endsWith('@login.local') ? uu.notification_email : uu.email
              if (effectiveEmail) {
                emailTargets.push({ email: effectiveEmail, name: uu.full_name || 'User', userId: uu.id })
              }
            })
          }
        })())
      } else if (isCpoBroadcast) {
        lookups.push((async () => {
          const { data: vendors } = await supabase
            .from('vendors')
            .select('contact_email, contact_phone, contact_name, organization_id')
            .eq('is_active', true)
          for (const vendor of vendors || []) {
            if (vendor.contact_email) {
              emailTargets.push({ email: vendor.contact_email, name: vendor.contact_name || 'Vendor' })
            }
            if (vendor.contact_phone) {
              smsTargets.push({ phone: vendor.contact_phone, name: vendor.contact_name || 'Vendor' })
            }
            if (vendor.organization_id) {
              const { data: orgUsers } = await supabase
                .from('users')
                .select('id, email, full_name, notification_email')
                .eq('organization_id', vendor.organization_id)
                .eq('is_active', true)
              ;(orgUsers || []).forEach(u => {
                inAppUserIds.add(u.id)
                const uu = u as { email?: string; notification_email?: string | null; full_name?: string; id: string }
                const effectiveEmail = uu.email?.endsWith('@login.local') ? uu.notification_email : uu.email
                if (effectiveEmail) {
                  emailTargets.push({ email: effectiveEmail, name: uu.full_name || 'User', userId: uu.id })
                }
              })
            }
          }
        })())
      }
    }

    // Assigned user
    if (config.assigned && order.assigned_to_id) {
      lookups.push((async () => {
        inAppUserIds.add(order.assigned_to_id!)
        const { data } = await supabase
          .from('users')
          .select('id, email, full_name, notification_email')
          .eq('id', order.assigned_to_id!)
          .single()
        if (data) {
          const effectiveEmail = (data as { email?: string }).email?.endsWith('@login.local')
            ? (data as { notification_email?: string | null }).notification_email
            : (data as { email?: string }).email
          if (effectiveEmail) {
            emailTargets.push({ email: effectiveEmail, name: (data as { full_name?: string }).full_name || 'Team Member', userId: (data as { id: string }).id })
          }
        }
      })())
    }

    // Admin users (all active admins)
    if (config.admin) {
      lookups.push((async () => {
        const { data } = await supabase
          .from('users')
          .select('id, email, full_name, notification_email')
          .eq('role', 'admin')
          .eq('is_active', true)
        ;(data || []).forEach(admin => {
          inAppUserIds.add((admin as { id: string }).id)
          const a = admin as { email?: string; notification_email?: string | null; full_name?: string; id: string }
          const effectiveEmail = a.email?.endsWith('@login.local') ? a.notification_email : a.email
          if (effectiveEmail) {
            emailTargets.push({ email: effectiveEmail, name: a.full_name || 'Admin', userId: a.id })
          }
        })
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

    // Send emails + SMS + in-app notifications in parallel
    const sends: Promise<void>[] = []

    for (const target of uniqueTargets) {
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
    }

    const smsText = this.buildSmsText(`[DLM] Order #${order.order_number}:`, messageText)

    const seenPhones = new Set<string>()
    const uniqueSmsTargets = smsTargets.filter(target => {
      const key = target.phone.replace(/\D/g, '')
      if (!key || seenPhones.has(key)) return false
      seenPhones.add(key)
      return true
    })

    for (const target of uniqueSmsTargets) {
      sends.push(
        this.sendSmsIfConfigured(target.phone, smsText).then(() => {})
      )
    }

    // SMS via Twilio for the customer contact as well.
    if (config.customer && order.customer_id) {
      sends.push((async () => {
        const { data: cust } = await supabase
          .from('customers')
          .select('contact_phone, company_name')
          .eq('id', order.customer_id!)
          .single()
        await this.sendSmsIfConfigured(cust?.contact_phone, smsText)
      })().catch((err) => console.error('[SMS] Failed:', err)))
    }

    for (const userId of Array.from(inAppUserIds)) {
      sends.push(
        this.createNotification({
          user_id: userId,
          type: 'in_app',
          title: subjectText,
          message: messageText,
          link: orderLink,
          metadata: { order_id: order.id, order_number: order.order_number, from_status: fromStatus, to_status: toStatus },
        }).then(() => {}).catch(() => {})
      )
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
      // Use service-role — this may be called from cron context
      let supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>
      try {
        supabase = await createServerSupabaseClient()
      } catch {
        supabase = createServiceRoleClient() as unknown as Awaited<ReturnType<typeof createServerSupabaseClient>>
      }
      const { data: user } = await supabase
        .from('users')
        .select('email, full_name, phone')
        .eq('id', userId)
        .single()

      if (!user?.email) return

      const subject = severity === 'breach'
        ? `[URGENT] SLA Breach — Order #${orderNumber}`
        : `SLA Warning — Order #${orderNumber}`

      const message = severity === 'breach'
        ? `Order #${orderNumber} has BREACHED its SLA deadline. Immediate action is required.`
        : `Order #${orderNumber} is approaching its SLA deadline.${hoursRemaining != null ? ` ${hoursRemaining} hours remaining.` : ''}`

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

      await this.sendSmsIfConfigured(
        (user as { phone?: string | null }).phone,
        this.buildSmsText(`[DLM] ${subject}`, message)
      )
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

  // ============================================================================
  // EXCEPTION / TRIAGE NOTIFICATIONS
  // ============================================================================

  /**
   * Notify customer organization when an exception/triage issue is created for their order.
   * This allows them to see what's happening with their devices in real-time.
   */
  static async sendExceptionNotification(input: {
    order_id: string
    order_number: string
    customer_id: string
    imei?: string
    device_name?: string
    exception_reason: string
    adjustment_amount?: number
  }): Promise<void> {
    try {
      const supabase = createServiceRoleClient()

      // Get customer and their organization
      const { data: customer } = await supabase
        .from('customers')
        .select('organization_id, contact_email, contact_phone, contact_name, company_name')
        .eq('id', input.customer_id)
        .single()

      if (!customer?.organization_id) return

      // Get all users in the customer's organization
      const { data: orgUsers } = await supabase
        .from('users')
        .select('id, email, full_name')
        .eq('organization_id', customer.organization_id)
        .eq('is_active', true)

      if (!orgUsers || orgUsers.length === 0) return

      const deviceInfo = input.device_name || (input.imei ? `IMEI: ${input.imei}` : 'Item')
      const title = `Exception Required — Order ${input.order_number}`
      
      let message = `${deviceInfo} requires review due to: ${input.exception_reason}`
      if (input.adjustment_amount && input.adjustment_amount !== 0) {
        const direction = input.adjustment_amount < 0 ? 'decrease' : 'increase'
        message += ` Price ${direction}: $${Math.abs(input.adjustment_amount).toFixed(2)}.`
      }
      message += ' Our team will review and update you shortly.'

      // Send in-app notification to all org users
      for (const user of orgUsers) {
        await this.createNotification({
          user_id: user.id,
          type: 'in_app',
          title,
          message,
          link: `/orders/${input.order_id}`,
          metadata: {
            order_id: input.order_id,
            order_number: input.order_number,
            imei: input.imei,
            exception_reason: input.exception_reason,
            adjustment_amount: input.adjustment_amount,
          },
        })
      }

      // Also send email to primary contact
      if (customer.contact_email) {
        const orderUrl = getAppPath(`/orders/${input.order_id}`)
        await EmailService.sendEmail(
          customer.contact_email,
          title,
          `Hello ${customer.contact_name || customer.company_name || 'Customer'},\n\n${message}\n\nView order: ${orderUrl}\n\nThank you.`
        )
      }

      await this.sendSmsIfConfigured(
        customer.contact_phone,
        this.buildSmsText(`[DLM] ${title}`, message)
      )
    } catch (err) {
      console.error('Failed to send exception notification:', err)
    }
  }

  /**
   * Notify customer organization when an exception has been resolved (approved/rejected).
   */
  static async sendExceptionResolvedNotification(input: {
    order_id: string
    order_number: string
    customer_id: string
    imei?: string
    device_name?: string
    approved: boolean
    new_price?: number
    notes?: string
  }): Promise<void> {
    try {
      const supabase = createServiceRoleClient()

      const { data: customer } = await supabase
        .from('customers')
        .select('organization_id, contact_email, contact_phone, contact_name, company_name')
        .eq('id', input.customer_id)
        .single()

      if (!customer?.organization_id) return

      const { data: orgUsers } = await supabase
        .from('users')
        .select('id, email, full_name')
        .eq('organization_id', customer.organization_id)
        .eq('is_active', true)

      if (!orgUsers || orgUsers.length === 0) return

      const deviceInfo = input.device_name || (input.imei ? `IMEI: ${input.imei}` : 'Item')
      const status = input.approved ? 'Approved' : 'Rejected'
      const title = `Exception ${status} — Order ${input.order_number}`
      
      let message = `${deviceInfo} exception has been ${status.toLowerCase()}.`
      if (input.approved && input.new_price) {
        message += ` Updated price: $${input.new_price.toFixed(2)}.`
      }
      if (input.notes) {
        message += ` Notes: ${input.notes}`
      }

      for (const user of orgUsers) {
        await this.createNotification({
          user_id: user.id,
          type: 'in_app',
          title,
          message,
          link: `/orders/${input.order_id}`,
          metadata: {
            order_id: input.order_id,
            order_number: input.order_number,
            imei: input.imei,
            approved: input.approved,
            new_price: input.new_price,
          },
        })
      }

      if (customer.contact_email) {
        const orderUrl = getAppPath(`/orders/${input.order_id}`)
        await EmailService.sendEmail(
          customer.contact_email,
          title,
          `Hello ${customer.contact_name || customer.company_name || 'Customer'},\n\n${message}\n\nView order: ${orderUrl}\n\nThank you.`
        )
      }

      await this.sendSmsIfConfigured(
        customer.contact_phone,
        this.buildSmsText(`[DLM] ${title}`, message)
      )
    } catch (err) {
      console.error('Failed to send exception resolved notification:', err)
    }
  }

  /**
   * Notify all admins about competitor price updates.
   * Called from scraper cron, competitor-sync cron, and manual price entry.
   */
  static async sendPriceUpdateNotification(input: {
    source: 'scraper' | 'csv_sync' | 'manual'
    total_updated: number
    total_new?: number
    failed_scrapers?: string[]
    details?: string
  }): Promise<void> {
    try {
      const supabase = createServiceRoleClient()

      // Find all active admins
      const { data: admins } = await supabase
        .from('users')
        .select('id')
        .eq('role', 'admin')
        .eq('is_active', true)

      if (!admins || admins.length === 0) return

      const sourceLabel =
        input.source === 'scraper' ? 'Price Scraper'
        : input.source === 'csv_sync' ? 'CSV Import'
        : 'Manual Entry'

      const title = `Pricing Updated — ${sourceLabel}`
      const parts: string[] = []
      if (input.total_updated > 0) parts.push(`${input.total_updated} prices updated`)
      if (input.total_new && input.total_new > 0) parts.push(`${input.total_new} new devices added`)
      if (input.failed_scrapers && input.failed_scrapers.length > 0) {
        parts.push(`Failed: ${input.failed_scrapers.join(', ')}`)
      }
      if (input.details) parts.push(input.details)
      const message = parts.length > 0 ? parts.join(' · ') : 'Competitor prices have been refreshed'

      // Notify each admin
      for (const admin of admins) {
        await this.createNotification({
          user_id: admin.id,
          type: 'in_app',
          title,
          message,
          link: '/admin/pricing',
          metadata: {
            audience: 'admin',
            source: input.source,
            total_updated: input.total_updated,
            total_new: input.total_new,
            failed_scrapers: input.failed_scrapers,
            timestamp: new Date().toISOString(),
          },
        })
      }
    } catch (err) {
      console.error('Failed to send price update notification:', err)
    }
  }
}
