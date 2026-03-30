// ============================================================================
// STALLION EXPRESS SERVICE — Canada's #1 eCommerce Shipping
// API v4: https://stallionexpress.redocly.app/stallionexpress-v4
// Production: https://ship.stallionexpress.ca/api/v4
// Sandbox:    https://sandbox.stallionexpress.ca/api/v4
// ============================================================================

import type { AddressInput } from '@/services/shipment.service'
import { readServerEnv } from '@/lib/server-env'

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

interface StallionAddress {
  name: string
  company?: string
  address1: string
  address2?: string
  city: string
  province_code: string   // e.g. "ON", "BC", "AB"
  postal_code: string
  country_code: string    // "CA", "US", etc.
  phone?: string
  email?: string
}

interface StallionItem {
  description: string
  quantity: number
  value: number           // CAD value per item
  weight?: number
  hs_code?: string
}

interface StallionShipmentRequest {
  store_id?: string
  name: string
  company?: string
  address1: string
  address2?: string
  city: string
  province_code: string
  postal_code: string
  country_code: string
  phone?: string
  email?: string
  carrier_code?: string     // e.g. "canadapost", "ups", "usps"
  postage_code?: string     // e.g. "regular_parcel", "xpresspost"
  package_code?: string     // e.g. "parcel", "letter", "flat"
  note?: string
  weight_unit: 'kg' | 'lb' | 'oz' | 'g'
  weight: number
  length?: number
  width?: number
  height?: number
  value?: number
  currency?: string         // "CAD" or "USD"
  order_id?: string         // external reference
  items?: StallionItem[]
}

interface StallionShipmentResponse {
  id: number | string
  tracking_number?: string
  carrier?: string
  carrier_code?: string
  postage_code?: string
  status?: string
  label_url?: string
  label_pdf_url?: string
  tracking_url?: string
  rate?: number
  rate_currency?: string
  estimated_delivery?: string
  created_at?: string
  [key: string]: unknown
}

interface StallionTrackingEvent {
  datetime?: string
  date?: string
  location?: string
  description?: string
  status?: string
}

interface StallionTrackingResponse {
  tracking_number?: string
  status?: string
  status_description?: string
  estimated_delivery?: string
  events?: StallionTrackingEvent[]
  tracking_url?: string
  [key: string]: unknown
}

interface StallionRateQuote {
  postage_type?: string
  carrier_code?: string
  postage_code?: string
  total_rate?: number
  currency?: string
  estimated_days?: number
  [key: string]: unknown
}

// ──────────────────────────────────────────────────────────────
// Exported interfaces for the shipping flow
// ──────────────────────────────────────────────────────────────

export interface StallionPurchaseLabelInput {
  fromAddress: AddressInput
  toAddress: AddressInput
  parcel: {
    length: number
    width: number
    height: number
    distanceUnit?: 'in' | 'cm'
    weight: number
    massUnit?: 'lb' | 'kg' | 'oz' | 'g'
  }
  preferredCarrier?: string
  preferredServiceLevelToken?: string
  orderId?: string
  items?: Array<{ description: string; quantity: number; value: number }>
}

export interface StallionPurchasedLabel {
  stallion_shipment_id: string
  tracking_number: string
  carrier: string
  tracking_status?: string
  label_url?: string
  label_pdf_url?: string
  tracking_url?: string
  rate_amount?: number
  rate_currency?: string
  estimated_delivery?: string
  stallion_raw: Record<string, unknown>
  // Legacy Shippo field aliases (for DB backward compatibility)
  shippo_shipment_id: string
  shippo_rate_id: string
  shippo_transaction_id: string
  shippo_tracking_status?: string
}

export interface StallionTrackingUpdate {
  tracking_number: string
  stallion_tracking_status: string
  status_details?: string
  status_date?: string
  location?: string
  internal_status: 'label_created' | 'picked_up' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception'
  events?: StallionTrackingEvent[]
}

// ──────────────────────────────────────────────────────────────
// Service
// ──────────────────────────────────────────────────────────────

export class StallionService {
  private static getApiToken(): string {
    const token = readServerEnv('STALLION_API_TOKEN')
    if (!token) throw new Error('STALLION_API_TOKEN is not configured')
    return token
  }

  private static getBaseUrl(): string {
    return readServerEnv('STALLION_API_BASE_URL') || 'https://ship.stallionexpress.ca/api/v4'
  }

  private static getStoreId(): string | undefined {
    return readServerEnv('STALLION_STORE_ID')
  }

  private static async request<T>(path: string, init?: RequestInit): Promise<T> {
    const token = this.getApiToken()
    const url = `${this.getBaseUrl()}${path}`

    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(init?.headers || {}),
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Stallion API error (${response.status}): ${text}`)
    }

    return response.json() as Promise<T>
  }

  // ──────────────────────────────────────────────────────────────
  // Address conversion
  // ──────────────────────────────────────────────────────────────

  private static toStallionAddress(address: AddressInput): StallionAddress {
    return {
      name: address.name,
      company: address.company,
      address1: address.street1,
      address2: address.street2,
      city: address.city,
      province_code: address.state,       // "ON", "BC", "TX", etc.
      postal_code: address.postal_code,
      country_code: address.country,      // "CA", "US"
      phone: address.phone,
      email: address.email,
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Get shipping rates
  // ──────────────────────────────────────────────────────────────

  static async getRates(input: {
    toAddress: AddressInput
    weight: number
    weightUnit?: 'kg' | 'lb'
    items?: Array<{ description: string; quantity: number; value: number }>
  }): Promise<StallionRateQuote[]> {
    const addr = this.toStallionAddress(input.toAddress)
    const payload = {
      ...addr,
      weight: input.weight,
      weight_unit: input.weightUnit || 'kg',
      items: input.items || [{ description: 'Device', quantity: 1, value: 100 }],
    }

    return this.request<StallionRateQuote[]>('/rates/quote', {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  // ──────────────────────────────────────────────────────────────
  // Create shipment & purchase label
  // ──────────────────────────────────────────────────────────────

  static async purchaseLabel(input: StallionPurchaseLabelInput): Promise<StallionPurchasedLabel> {
    const toAddr = this.toStallionAddress(input.toAddress)

    // Convert mass unit
    const massUnit = input.parcel.massUnit || 'lb'
    const weightUnit = (massUnit === 'lb' || massUnit === 'oz') ? 'lb' : 'kg'
    let weight = input.parcel.weight
    if (massUnit === 'oz') weight = weight / 16  // oz to lb
    if (massUnit === 'g') weight = weight / 1000 // g to kg

    const payload: StallionShipmentRequest = {
      store_id: this.getStoreId(),
      name: toAddr.name,
      company: toAddr.company,
      address1: toAddr.address1,
      address2: toAddr.address2,
      city: toAddr.city,
      province_code: toAddr.province_code,
      postal_code: toAddr.postal_code,
      country_code: toAddr.country_code,
      phone: toAddr.phone,
      email: toAddr.email,
      weight_unit: weightUnit,
      weight: Math.round(weight * 100) / 100,
      length: input.parcel.length,
      width: input.parcel.width,
      height: input.parcel.height,
      package_code: 'parcel',
      note: input.orderId ? `Order: ${input.orderId}` : undefined,
      order_id: input.orderId,
      currency: 'CAD',
      items: input.items || [{ description: 'Electronic Device', quantity: 1, value: 100 }],
    }

    // Set carrier preference if specified
    if (input.preferredCarrier) {
      payload.carrier_code = input.preferredCarrier.toLowerCase().replace(/\s+/g, '')
    }
    if (input.preferredServiceLevelToken) {
      payload.postage_code = input.preferredServiceLevelToken
    }

    const result = await this.request<StallionShipmentResponse>('/shipments', {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    const shipmentId = String(result.id || '')
    if (!shipmentId) {
      throw new Error('Stallion shipment creation failed — no ID returned')
    }

    return {
      stallion_shipment_id: shipmentId,
      tracking_number: result.tracking_number || '',
      carrier: result.carrier || result.carrier_code || 'Stallion Express',
      tracking_status: result.status || 'label_created',
      label_url: result.label_url,
      label_pdf_url: result.label_pdf_url || result.label_url,
      tracking_url: result.tracking_url || (result.tracking_number ? `https://stallionexpress.ca/tracking/?tracking_numbers=${result.tracking_number}` : undefined),
      rate_amount: result.rate ? Number(result.rate) : undefined,
      rate_currency: result.rate_currency || 'CAD',
      estimated_delivery: result.estimated_delivery,
      stallion_raw: result as Record<string, unknown>,
      // Backward compat — store in same DB columns as Shippo
      shippo_shipment_id: `stallion_${shipmentId}`,
      shippo_rate_id: `stallion_rate_${shipmentId}`,
      shippo_transaction_id: `stallion_txn_${shipmentId}`,
      shippo_tracking_status: result.status || 'label_created',
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Track shipment
  // ──────────────────────────────────────────────────────────────

  static async fetchTrackingStatus(trackingNumber: string): Promise<StallionTrackingUpdate> {
    const encoded = encodeURIComponent(trackingNumber)
    const result = await this.request<StallionTrackingResponse>(
      `/shipments/track?tracking_number=${encoded}`
    )

    const status = result.status || 'UNKNOWN'
    const events = result.events || []
    const latestEvent = events[events.length - 1]
    const location = latestEvent?.location

    return {
      tracking_number: result.tracking_number || trackingNumber,
      stallion_tracking_status: status,
      status_details: result.status_description || latestEvent?.description,
      status_date: latestEvent?.datetime || latestEvent?.date,
      location,
      internal_status: this.mapTrackingStatusToInternal(status),
      events,
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Status mapping
  // ──────────────────────────────────────────────────────────────

  static mapTrackingStatusToInternal(status: string): StallionTrackingUpdate['internal_status'] {
    const s = status.toUpperCase()
    if (s.includes('DELIVERED')) return 'delivered'
    if (s.includes('OUT_FOR_DELIVERY') || s.includes('OUT FOR DELIVERY')) return 'out_for_delivery'
    if (s.includes('TRANSIT') || s.includes('IN_TRANSIT') || s.includes('SHIPPING') || s.includes('DEPARTED') || s.includes('ARRIVED')) return 'in_transit'
    if (s.includes('PICKUP') || s.includes('PICKED') || s.includes('ACCEPTED') || s.includes('COLLECTED')) return 'picked_up'
    if (s.includes('FAIL') || s.includes('EXCEPTION') || s.includes('RETURN') || s.includes('UNDELIVERABLE') || s.includes('REFUSED')) return 'exception'
    if (s.includes('LABEL') || s.includes('CREATED') || s.includes('PENDING') || s.includes('PRE_TRANSIT')) return 'label_created'
    return 'in_transit' // Default to in_transit for unknown statuses
  }

  // ──────────────────────────────────────────────────────────────
  // List stores
  // ──────────────────────────────────────────────────────────────

  static async getStores(): Promise<Array<{ id: string; name: string; [key: string]: unknown }>> {
    return this.request<Array<{ id: string; name: string }>>('/stores')
  }

  // ──────────────────────────────────────────────────────────────
  // Get credit balance
  // ──────────────────────────────────────────────────────────────

  static async getCredits(): Promise<{ balance: number; currency: string }> {
    return this.request<{ balance: number; currency: string }>('/credits')
  }

  // ──────────────────────────────────────────────────────────────
  // Health check
  // ──────────────────────────────────────────────────────────────

  static async healthCheck(): Promise<{
    keyConfigured: boolean
    apiReachable: boolean
    keyValid: boolean
    message: string
    credits?: number
  }> {
    const keyConfigured = Boolean(process.env.STALLION_API_TOKEN)
    if (!keyConfigured) {
      return {
        keyConfigured: false,
        apiReachable: false,
        keyValid: false,
        message: 'STALLION_API_TOKEN is not configured',
      }
    }

    try {
      const credits = await this.getCredits()
      return {
        keyConfigured: true,
        apiReachable: true,
        keyValid: true,
        message: `Stallion Express connected. Balance: $${credits.balance} ${credits.currency || 'CAD'}`,
        credits: credits.balance,
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error'

      if (msg.includes('401') || msg.includes('403') || msg.includes('Unauthorized')) {
        return {
          keyConfigured: true,
          apiReachable: true,
          keyValid: false,
          message: 'Stallion API token is invalid or expired',
        }
      }

      return {
        keyConfigured: true,
        apiReachable: false,
        keyValid: false,
        message: msg,
      }
    }
  }
}
