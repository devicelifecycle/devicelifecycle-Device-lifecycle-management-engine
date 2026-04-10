// ============================================================================
// SHIPMENT SERVICE
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { readServerEnv } from '@/lib/server-env'
import { ShippingProviderService } from '@/services/shipping-provider.service'
import { OrderService } from '@/services/order.service'
import { NotificationService } from '@/services/notification.service'
import { EmailService } from '@/services/email.service'
import type { Shipment } from '@/types'

/** Check if the shipping label provider is configured */
export function isShippingConfigured(): boolean {
  return Boolean(readServerEnv('STALLION_API_TOKEN'))
}

export function getActiveShippingProvider(): 'shipping_provider' | 'manual' {
  return isShippingConfigured() ? 'shipping_provider' : 'manual'
}

export interface CreateShipmentInput {
  order_id: string
  direction: 'inbound' | 'outbound'
  carrier: string
  tracking_number: string
  from_address: AddressInput
  to_address: AddressInput
  estimated_delivery?: string
  weight?: number
  dimensions?: {
    length: number
    width: number
    height: number
  }
  notes?: string
  created_by_id: string
}

export interface AddressInput {
  name: string
  company?: string
  street1: string
  street2?: string
  city: string
  state: string
  postal_code: string
  country: string
  phone?: string
  email?: string
}

export class ShipmentService {
  /**
   * Create a new shipment
   */
  static async createShipment(input: CreateShipmentInput): Promise<Shipment> {
    // Use service role to bypass RLS — the API route has already validated permissions
    const supabase = createServiceRoleClient()

    const { data, error } = await supabase
      .from('shipments')
      .insert({
        order_id: input.order_id,
        direction: input.direction,
        carrier: input.carrier,
        tracking_number: input.tracking_number,
        from_address: input.from_address,
        to_address: input.to_address,
        estimated_delivery: input.estimated_delivery,
        weight: input.weight,
        dimensions: input.dimensions,
        notes: input.notes,
        status: 'label_created',
        created_by_id: input.created_by_id,
      })
      .select()
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return data as Shipment
  }

  /**
   * Get shipment by ID
   */
  static async getShipmentById(id: string): Promise<Shipment | null> {
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('shipments')
      .select(`
        *,
        order:orders(*)
      `)
      .eq('id', id)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw new Error(error.message)
    }

    return data as Shipment
  }

  /**
   * Get shipments by order ID
   */
  static async getShipmentsByOrderId(orderId: string): Promise<Shipment[]> {
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('shipments')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error(error.message)
    }

    return data as Shipment[]
  }

  /**
   * Get shipment by tracking number
   */
  static async getShipmentByTrackingNumber(trackingNumber: string): Promise<Shipment | null> {
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('shipments')
      .select(`
        *,
        order:orders(*)
      `)
      .eq('tracking_number', trackingNumber)
      .single()

    if (error) {
      if (error.code === 'PGRST116') return null
      throw new Error(error.message)
    }

    return data as Shipment
  }

  /**
   * Update shipment status
   */
  static async updateShipmentStatus(
    id: string,
    status: Shipment['status'],
    metadata?: Record<string, unknown>
  ): Promise<Shipment> {
    const supabase = await createServerSupabaseClient()

    const updates: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    }

    // Set timestamp based on status
    switch (status) {
      case 'picked_up':
        updates.picked_up_at = new Date().toISOString()
        break
      case 'in_transit':
        updates.in_transit_at = new Date().toISOString()
        break
      case 'out_for_delivery':
        updates.out_for_delivery_at = new Date().toISOString()
        break
      case 'delivered':
        updates.delivered_at = new Date().toISOString()
        break
      case 'exception':
        updates.exception_at = new Date().toISOString()
        updates.exception_details = metadata?.exception_details
        break
    }

    const { data, error } = await supabase
      .from('shipments')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return data as Shipment
  }

  /**
   * Attach purchased label data to shipment
   * Note: DB columns are named shippo_* for backward compatibility
   */
  static async attachLabelPurchase(
    shipmentId: string,
    input: {
      stallion_shipment_id: string
      tracking_number: string
      carrier: string
      tracking_status?: string
      label_url?: string
      label_pdf_url?: string
      rate_amount?: number
      rate_currency?: string
      estimated_delivery?: string
      raw_response: Record<string, unknown>
      purchased_by_id: string
    }
  ): Promise<Shipment> {
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('shipments')
      .update({
        carrier: input.carrier,
        tracking_number: input.tracking_number,
        // Store in shippo_* columns for backward compatibility
        shippo_shipment_id: input.stallion_shipment_id,
        shippo_rate_id: `stallion_${input.stallion_shipment_id}`,
        shippo_transaction_id: `stallion_txn_${input.stallion_shipment_id}`,
        shippo_tracking_status: input.tracking_status,
        label_url: input.label_url,
        label_pdf_url: input.label_pdf_url,
        rate_amount: input.rate_amount,
        rate_currency: input.rate_currency,
        estimated_delivery: input.estimated_delivery,
        shippo_raw: { ...input.raw_response, provider: 'shipping_provider' },
        status: 'label_created',
        purchased_by_id: input.purchased_by_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', shipmentId)
      .select()
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return data as Shipment
  }

  /**
   * Process tracking webhook updates. Uses service-role client (no user session).
   */
  static async processTrackingWebhook(input: {
    tracking_number: string
    tracking_status: string
    status_details?: string
    status_date?: string
    location?: { city?: string; state?: string; country?: string }
    event?: string
  }): Promise<void> {
    const supabase = createServiceRoleClient()

    const { data: shipment } = await supabase
      .from('shipments')
      .select('id, order_id, tracking_events')
      .eq('tracking_number', input.tracking_number)
      .single()

    if (!shipment) return

    const internalStatus = ShippingProviderService.mapTrackingStatusToInternal(input.tracking_status)

    await supabase
      .from('shipments')
      .update({
        status: internalStatus,
        shippo_tracking_status: input.tracking_status,
        ...(internalStatus === 'exception' && {
          exception_details: input.status_details || 'Carrier exception',
          exception_at: new Date().toISOString(),
        }),
        ...(internalStatus === 'delivered' && { delivered_at: new Date().toISOString() }),
        ...(internalStatus === 'in_transit' && { in_transit_at: new Date().toISOString() }),
        ...(internalStatus === 'out_for_delivery' && { out_for_delivery_at: new Date().toISOString() }),
        updated_at: new Date().toISOString(),
      })
      .eq('id', shipment.id)

    const loc = input.location
    const locationStr = [loc?.city, loc?.state, loc?.country].filter(Boolean).join(', ') || 'N/A'
    const currentEvents = (shipment.tracking_events as unknown[]) || []
    const newEvent = {
      status: input.tracking_status,
      description: input.status_details || input.event || 'Tracking update',
      location: locationStr,
      timestamp: input.status_date || new Date().toISOString(),
    }

    await supabase
      .from('shipments')
      .update({
        tracking_events: [...currentEvents, newEvent],
        updated_at: new Date().toISOString(),
      })
      .eq('id', shipment.id)

    // Send notifications for delivery and exception events
    if ((internalStatus === 'delivered' || internalStatus === 'exception') && shipment.order_id) {
      try {
        const { data: order } = await supabase
          .from('orders')
          .select('id, order_number, customer_id, created_by_id')
          .eq('id', shipment.order_id)
          .single()

        if (order) {
          // Notify the order creator
          const title = internalStatus === 'delivered'
            ? `Shipment Delivered — ${order.order_number}`
            : `Shipment Exception — ${order.order_number}`
          const message = internalStatus === 'delivered'
            ? `Shipment ${input.tracking_number} for order #${order.order_number} has been delivered.`
            : `Shipment ${input.tracking_number} for order #${order.order_number} has an exception: ${input.status_details || 'Carrier issue'}`

          await NotificationService.createNotification({
            user_id: order.created_by_id,
            type: 'in_app',
            title,
            message,
            link: `/orders/${order.id}`,
            metadata: {
              order_id: order.id,
              order_number: order.order_number,
              tracking_number: input.tracking_number,
              shipment_status: internalStatus,
            },
          }).catch(() => {}) // Non-fatal
        }
      } catch {
        // Non-fatal: notification delivery should not break webhook
      }
    }
  }

  /**
   * Update tracking status metadata
   */
  static async updateTrackingMeta(
    shipmentId: string,
    updates: {
      tracking_status?: string
    }
  ): Promise<void> {
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase
      .from('shipments')
      .update({
        shippo_tracking_status: updates.tracking_status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', shipmentId)

    if (error) {
      throw new Error(error.message)
    }
  }

  /**
   * Add tracking event
   */
  static async addTrackingEvent(
    shipmentId: string,
    event: {
      status: string
      location: string
      description: string
      timestamp: string
    }
  ): Promise<void> {
    const supabase = await createServerSupabaseClient()

    // Get current events
    const { data: shipment } = await supabase
      .from('shipments')
      .select('tracking_events')
      .eq('id', shipmentId)
      .single()

    const currentEvents = (shipment?.tracking_events as unknown[]) || []

    // Add new event
    const { error } = await supabase
      .from('shipments')
      .update({
        tracking_events: [...currentEvents, event],
        updated_at: new Date().toISOString(),
      })
      .eq('id', shipmentId)

    if (error) {
      throw new Error(error.message)
    }
  }

  /**
   * Get pending shipments (inbound, awaiting receipt)
   */
  static async getPendingInboundShipments(): Promise<Shipment[]> {
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('shipments')
      .select(`
        *,
        order:orders(*)
      `)
      .eq('direction', 'inbound')
      .not('status', 'in', '(delivered,exception)')
      .order('estimated_delivery', { ascending: true })

    if (error) {
      throw new Error(error.message)
    }

    return data as Shipment[]
  }

  /**
   * Get outbound shipments ready to ship
   */
  static async getPendingOutboundShipments(): Promise<Shipment[]> {
    const supabase = await createServerSupabaseClient()

    const { data, error } = await supabase
      .from('shipments')
      .select(`
        *,
        order:orders(*)
      `)
      .eq('direction', 'outbound')
      .eq('status', 'label_created')
      .order('created_at', { ascending: true })

    if (error) {
      throw new Error(error.message)
    }

    return data as Shipment[]
  }

  /**
   * Mark shipment as received at COE.
   * - Updates shipment status to delivered
   * - Creates IMEI records for each order item (placeholder IMEI if none provided)
   * - Transitions order to 'received' when status is 'shipped_to_coe'
   */
  static async markAsReceived(
    id: string,
    receivedById: string,
    notes?: string,
    options?: {
      receivedQuantity?: number | null
      expectedQuantity?: number | null
    }
  ): Promise<Shipment> {
    const supabase = await createServerSupabaseClient()

    // Load shipment with order
    const shipment = await this.getShipmentById(id)
    if (!shipment) throw new Error('Shipment not found')

    const orderId = shipment.order_id as string
    if (!orderId) throw new Error('Shipment has no order')

    const receivedQuantity = options?.receivedQuantity ?? null
    const expectedQuantity = options?.expectedQuantity ?? null
    const hasQuantityMismatch =
      receivedQuantity != null &&
      expectedQuantity != null &&
      receivedQuantity !== expectedQuantity
    const mismatchDetails = hasQuantityMismatch
      ? `Quantity mismatch detected at receiving: expected ${expectedQuantity}, received ${receivedQuantity}.`
      : ''
    const combinedNotes = [notes, mismatchDetails].filter(Boolean).join(' ').trim() || undefined

    // Update shipment
    const { data: updatedShipment, error } = await supabase
      .from('shipments')
      .update({
        status: 'delivered',
        delivered_at: new Date().toISOString(),
        received_by_id: receivedById,
        receiving_notes: combinedNotes,
        exception_details: hasQuantityMismatch ? mismatchDetails : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) throw new Error(error.message)

    // Load order and items
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select('id, status, order_number, type, customer_id, customer:customers(contact_email, contact_phone, contact_name, company_name, organization_id)')
      .eq('id', orderId)
      .single()

    if (orderErr || !order) {
      // Non-fatal: continue without order update
    } else {
      const { data: items } = await supabase
        .from('order_items')
        .select('id, device_id, quantity, claimed_condition, quoted_price, unit_price')
        .eq('order_id', orderId)

      const orderItems = (items || []).map(i => ({ ...i, quantity: i.quantity || 1 }))

      // Check existing IMEI records to avoid duplicates
      const { data: existing } = await supabase
        .from('imei_records')
        .select('id')
        .eq('order_id', orderId)
      const existingCount = existing?.length ?? 0

      if (existingCount === 0) {
        const base = `RCV-${Date.now().toString(36)}`
        let seq = 0
        for (const item of orderItems) {
          const qty = Math.max(1, item.quantity)
          for (let i = 0; i < qty; i++) {
            const imei = `${base}-${(seq++).toString(36)}`
            await supabase.from('imei_records').insert({
              imei,
              order_id: orderId,
              order_item_id: item.id,
              device_id: item.device_id,
              claimed_condition: item.claimed_condition,
              quoted_price: item.quoted_price ?? item.unit_price ?? null,
              triage_status: 'pending',
            })
          }
        }
      }

      // Transition order to received if valid
      if ((order.status as string) === 'shipped_to_coe') {
        try {
          await OrderService.transitionOrder(orderId, 'received' as import('@/types').OrderStatus, receivedById, notes)
        } catch {
          // Non-fatal: order transition failed
        }
      }

      if (hasQuantityMismatch) {
        const orderNumber = order.order_number as string
        const orderType = (order.type as string | undefined) ?? 'trade_in'
        const title = `Quantity mismatch — Order ${orderNumber}`
        const message = `Receiving count mismatch recorded for ${orderType === 'trade_in' ? 'trade-in' : 'order'} #${orderNumber}: expected ${expectedQuantity}, received ${receivedQuantity}.`

        const { data: admins } = await supabase
          .from('users')
          .select('id')
          .eq('role', 'admin')
          .eq('is_active', true)

        for (const admin of admins || []) {
          await NotificationService.createNotification({
            user_id: admin.id,
            type: 'in_app',
            title,
            message,
            link: `/orders/${orderId}`,
            metadata: {
              order_id: orderId,
              order_number: orderNumber,
              received_quantity: receivedQuantity,
              expected_quantity: expectedQuantity,
              audience: 'admin',
            },
          }).catch(() => {})
        }

        const customerRecord = order.customer as {
          contact_email?: string | null
          contact_phone?: string | null
          contact_name?: string | null
          company_name?: string | null
          organization_id?: string | null
        } | null

        if (customerRecord?.organization_id) {
          const { data: customerUsers } = await supabase
            .from('users')
            .select('id')
            .eq('organization_id', customerRecord.organization_id)
            .eq('role', 'customer')
            .eq('is_active', true)

          for (const customerUser of customerUsers || []) {
            await NotificationService.createNotification({
              user_id: customerUser.id,
              type: 'in_app',
              title,
              message,
              link: `/orders/${orderId}`,
              metadata: {
                order_id: orderId,
                order_number: orderNumber,
                received_quantity: receivedQuantity,
                expected_quantity: expectedQuantity,
                audience: 'customer',
              },
            }).catch(() => {})
          }

          const recipientLabel = customerRecord.contact_name || customerRecord.company_name || 'Customer'
          const orderUrl = `/orders/${orderId}`
          if (customerRecord.contact_email) {
            await EmailService.sendEmail(
              customerRecord.contact_email,
              title,
              `Hello ${recipientLabel},\n\n${message}\n\nView order: ${orderUrl}\n\nThank you.`
            ).catch(() => {})
          }

          if (customerRecord.contact_phone && EmailService.isTwilioConfigured()) {
            await EmailService.sendSMS(
              customerRecord.contact_phone,
              `[DLM] ${title}: expected ${expectedQuantity}, received ${receivedQuantity}. Review ${orderUrl}`.slice(0, 160)
            ).catch(() => {})
          }
        }
      }
    }

    return updatedShipment as Shipment
  }

  /**
   * Get shipping statistics
   */
  static async getShippingStats(startDate?: Date, endDate?: Date): Promise<{
    total_shipments: number
    inbound: number
    outbound: number
    delivered: number
    in_transit: number
    exceptions: number
    average_delivery_days: number
  }> {
    const supabase = await createServerSupabaseClient()

    let query = supabase.from('shipments').select('*')

    if (startDate) {
      query = query.gte('created_at', startDate.toISOString())
    }
    if (endDate) {
      query = query.lte('created_at', endDate.toISOString())
    }

    const { data, error } = await query

    if (error) {
      throw new Error(error.message)
    }

    const shipments = data || []

    const inbound = shipments.filter((s: { direction: string }) => s.direction === 'inbound').length
    const outbound = shipments.filter((s: { direction: string }) => s.direction === 'outbound').length
    const delivered = shipments.filter((s: { status: string }) => s.status === 'delivered').length
    const inTransit = shipments.filter((s: { status: string }) =>
      ['picked_up', 'in_transit', 'out_for_delivery'].includes(s.status)
    ).length
    const exceptions = shipments.filter((s: { status: string }) => s.status === 'exception').length

    // Calculate average delivery days
    const deliveredShipments = shipments.filter((s: {
      status: string
      created_at: string
      delivered_at: string | null
    }) => s.status === 'delivered' && s.delivered_at)

    let avgDeliveryDays = 0
    if (deliveredShipments.length > 0) {
      const totalDays = deliveredShipments.reduce((sum: number, s: {
        created_at: string
        delivered_at: string
      }) => {
        const created = new Date(s.created_at)
        const delivered = new Date(s.delivered_at)
        return sum + (delivered.getTime() - created.getTime()) / (1000 * 60 * 60 * 24)
      }, 0)
      avgDeliveryDays = totalDays / deliveredShipments.length
    }

    return {
      total_shipments: shipments.length,
      inbound,
      outbound,
      delivered,
      in_transit: inTransit,
      exceptions,
      average_delivery_days: Math.round(avgDeliveryDays * 10) / 10,
    }
  }
}
