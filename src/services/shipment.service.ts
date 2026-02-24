// ============================================================================
// SHIPMENT SERVICE
// ============================================================================

import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { Shipment } from '@/types'

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
    const supabase = createServerSupabaseClient()

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
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('shipments')
      .select(`
        *,
        order:orders(*),
        created_by:users(*)
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
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('shipments')
      .select(`
        *,
        created_by:users(*)
      `)
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
    const supabase = createServerSupabaseClient()

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
    const supabase = createServerSupabaseClient()

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
    const supabase = createServerSupabaseClient()

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
    const supabase = createServerSupabaseClient()

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
    const supabase = createServerSupabaseClient()

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
   * Mark shipment as received at COE
   */
  static async markAsReceived(
    id: string,
    receivedById: string,
    notes?: string
  ): Promise<Shipment> {
    const supabase = createServerSupabaseClient()

    const { data, error } = await supabase
      .from('shipments')
      .update({
        status: 'delivered',
        delivered_at: new Date().toISOString(),
        received_by_id: receivedById,
        receiving_notes: notes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return data as Shipment
  }

  /**
   * Generate shipping label (placeholder for carrier integration)
   */
  static async generateShippingLabel(input: {
    carrier: string
    from_address: AddressInput
    to_address: AddressInput
    weight: number
    dimensions?: { length: number; width: number; height: number }
  }): Promise<{
    tracking_number: string
    label_url: string
    estimated_delivery: string
    cost: number
  }> {
    // This would integrate with shipping carriers (FedEx, UPS, USPS, etc.)
    // For now, generate a mock tracking number
    const trackingNumber = `MOCK${Date.now()}${Math.random().toString(36).substring(2, 8).toUpperCase()}`
    
    return {
      tracking_number: trackingNumber,
      label_url: `/api/shipments/label/${trackingNumber}`,
      estimated_delivery: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      cost: 12.99,
    }
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
    const supabase = createServerSupabaseClient()

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
