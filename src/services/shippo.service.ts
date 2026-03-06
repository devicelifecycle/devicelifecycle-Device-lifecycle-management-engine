import { createHmac, timingSafeEqual } from 'crypto'
import type { AddressInput } from '@/services/shipment.service'

interface ShippoAddress {
  name: string
  company?: string
  street1: string
  street2?: string
  city: string
  state: string
  zip: string
  country: string
  phone?: string
  email?: string
}

interface ShippoParcel {
  length: string
  width: string
  height: string
  distance_unit: 'in' | 'cm'
  weight: string
  mass_unit: 'lb' | 'kg' | 'oz' | 'g'
}

interface ShippoRate {
  object_id: string
  amount: string
  currency: string
  provider: string
  servicelevel?: {
    token?: string
    name?: string
  }
  estimated_days?: number
}

interface ShippoShipmentResponse {
  object_id: string
  rates?: ShippoRate[]
  messages?: Array<{ text?: string; code?: string }>
}

interface ShippoTransactionResponse {
  object_id: string
  status: string
  tracking_number?: string
  tracking_status?: string
  tracking_url_provider?: string
  eta?: string
  rate?: string
  label_url?: string
  label_file?: string
  commercial_invoice_url?: string
  messages?: Array<{ text?: string; code?: string }>
}

interface ShippoTrackResponse {
  tracking_number?: string
  tracking_status?: {
    status?: string
    status_details?: string
    status_date?: string
    location?: {
      city?: string
      state?: string
      zip?: string
      country?: string
    }
  }
}

export interface ShippoPurchaseLabelInput {
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
}

export interface ShippoPurchasedLabel {
  shippo_shipment_id: string
  shippo_rate_id: string
  shippo_transaction_id: string
  tracking_number: string
  carrier: string
  shippo_tracking_status?: string
  label_url?: string
  label_pdf_url?: string
  tracking_url?: string
  rate_amount?: number
  rate_currency?: string
  estimated_delivery?: string
  shippo_raw: Record<string, unknown>
}

export interface ShippoTrackingUpdate {
  tracking_number: string
  shippo_tracking_status: string
  status_details?: string
  status_date?: string
  location?: string
  internal_status: 'label_created' | 'picked_up' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'exception'
}

export class ShippoService {
  private static getApiKey(): string {
    const key = process.env.SHIPPO_API_KEY
    if (!key) throw new Error('SHIPPO_API_KEY is not configured')
    return key
  }

  private static getBaseUrl(): string {
    return process.env.SHIPPO_API_BASE_URL || 'https://api.goshippo.com'
  }

  private static async shippoRequest<T>(path: string, init?: RequestInit): Promise<T> {
    const apiKey = this.getApiKey()
    const response = await fetch(`${this.getBaseUrl()}${path}`, {
      ...init,
      headers: {
        Authorization: `ShippoToken ${apiKey}`,
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Shippo request failed (${response.status}): ${text}`)
    }

    return response.json() as Promise<T>
  }

  private static toShippoAddress(address: AddressInput): ShippoAddress {
    return {
      name: address.name,
      company: address.company,
      street1: address.street1,
      street2: address.street2,
      city: address.city,
      state: address.state,
      zip: address.postal_code,
      country: address.country,
      phone: address.phone,
      email: address.email,
    }
  }

  private static pickRate(rates: ShippoRate[], preferredCarrier?: string, preferredServiceLevelToken?: string): ShippoRate {
    if (rates.length === 0) throw new Error('No Shippo rates returned')

    const serviceLevelMatch = preferredServiceLevelToken
      ? rates.find(rate => rate.servicelevel?.token?.toLowerCase() === preferredServiceLevelToken.toLowerCase())
      : undefined
    if (serviceLevelMatch) return serviceLevelMatch

    const carrierCandidates = preferredCarrier
      ? rates.filter(rate => rate.provider?.toLowerCase() === preferredCarrier.toLowerCase())
      : rates

    const sorted = [...carrierCandidates].sort((a, b) => parseFloat(a.amount || '0') - parseFloat(b.amount || '0'))
    return sorted[0] || rates[0]
  }

  static async purchaseLabel(input: ShippoPurchaseLabelInput): Promise<ShippoPurchasedLabel> {
    const shipmentPayload = {
      address_from: this.toShippoAddress(input.fromAddress),
      address_to: this.toShippoAddress(input.toAddress),
      parcels: [
        {
          length: String(input.parcel.length),
          width: String(input.parcel.width),
          height: String(input.parcel.height),
          distance_unit: input.parcel.distanceUnit || 'in',
          weight: String(input.parcel.weight),
          mass_unit: input.parcel.massUnit || 'lb',
        } as ShippoParcel,
      ],
      async: false,
    }

    const shipment = await this.shippoRequest<ShippoShipmentResponse>('/shipments/', {
      method: 'POST',
      body: JSON.stringify(shipmentPayload),
    })

    if (!shipment.object_id) {
      throw new Error(shipment.messages?.map(m => m.text || m.code).filter(Boolean).join(', ') || 'Shippo shipment creation failed')
    }

    const rates = shipment.rates || []
    const selectedRate = this.pickRate(rates, input.preferredCarrier, input.preferredServiceLevelToken)

    const transaction = await this.shippoRequest<ShippoTransactionResponse>('/transactions/', {
      method: 'POST',
      body: JSON.stringify({
        rate: selectedRate.object_id,
        label_file_type: 'PDF',
        async: false,
      }),
    })

    if (transaction.status !== 'SUCCESS' || !transaction.tracking_number) {
      throw new Error(transaction.messages?.map(m => m.text || m.code).filter(Boolean).join(', ') || 'Shippo label purchase failed')
    }

    return {
      shippo_shipment_id: shipment.object_id,
      shippo_rate_id: selectedRate.object_id,
      shippo_transaction_id: transaction.object_id,
      tracking_number: transaction.tracking_number,
      carrier: selectedRate.provider,
      shippo_tracking_status: transaction.tracking_status,
      label_url: transaction.label_url,
      label_pdf_url: transaction.label_file,
      tracking_url: transaction.tracking_url_provider,
      rate_amount: Number.parseFloat(selectedRate.amount || '0') || undefined,
      rate_currency: selectedRate.currency,
      estimated_delivery: transaction.eta,
      shippo_raw: {
        shipment,
        selected_rate: selectedRate,
        transaction,
      },
    }
  }

  static mapShippoTrackingStatusToInternal(status: string): ShippoTrackingUpdate['internal_status'] {
    const normalized = status.toUpperCase()
    if (normalized.includes('DELIVERED')) return 'delivered'
    if (normalized.includes('OUT_FOR_DELIVERY')) return 'out_for_delivery'
    if (normalized.includes('TRANSIT')) return 'in_transit'
    if (normalized.includes('PICKUP') || normalized.includes('PICKED')) return 'picked_up'
    if (normalized.includes('FAIL') || normalized.includes('EXCEPTION') || normalized.includes('RETURN') || normalized.includes('UNDELIVERABLE')) return 'exception'
    return 'label_created'
  }

  static async fetchTrackingStatus(carrier: string, trackingNumber: string): Promise<ShippoTrackingUpdate> {
    const encodedCarrier = encodeURIComponent(carrier)
    const encodedTracking = encodeURIComponent(trackingNumber)
    const track = await this.shippoRequest<ShippoTrackResponse>(`/tracks/${encodedCarrier}/${encodedTracking}`)

    const trackingStatus = track.tracking_status?.status || 'UNKNOWN'
    const location = track.tracking_status?.location
      ? [track.tracking_status.location.city, track.tracking_status.location.state, track.tracking_status.location.country].filter(Boolean).join(', ')
      : undefined

    return {
      tracking_number: track.tracking_number || trackingNumber,
      shippo_tracking_status: trackingStatus,
      status_details: track.tracking_status?.status_details,
      status_date: track.tracking_status?.status_date,
      location,
      internal_status: this.mapShippoTrackingStatusToInternal(trackingStatus),
    }
  }

  static validateWebhook(requestBody: string, signatureHeader: string | null): boolean | 'not_configured' {
    const secret = process.env.SHIPPO_WEBHOOK_SECRET
    if (!secret) return 'not_configured'
    if (!signatureHeader) return false

    const computed = createHmac('sha256', secret).update(requestBody).digest('hex')
    const a = Buffer.from(signatureHeader)
    const b = Buffer.from(computed)

    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  }

  static async healthCheck(): Promise<{
    keyConfigured: boolean
    apiReachable: boolean
    keyValid: boolean
    message: string
  }> {
    const keyConfigured = Boolean(process.env.SHIPPO_API_KEY)
    if (!keyConfigured) {
      return {
        keyConfigured: false,
        apiReachable: false,
        keyValid: false,
        message: 'SHIPPO_API_KEY is not configured',
      }
    }

    try {
      const response = await fetch(`${this.getBaseUrl()}/carrier_accounts`, {
        headers: {
          Authorization: `ShippoToken ${this.getApiKey()}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      })

      if (response.status === 401 || response.status === 403) {
        return {
          keyConfigured: true,
          apiReachable: true,
          keyValid: false,
          message: 'Shippo API key is invalid or unauthorized',
        }
      }

      if (!response.ok) {
        return {
          keyConfigured: true,
          apiReachable: true,
          keyValid: false,
          message: `Shippo responded with status ${response.status}`,
        }
      }

      return {
        keyConfigured: true,
        apiReachable: true,
        keyValid: true,
        message: 'Shippo connectivity is healthy',
      }
    } catch (error) {
      return {
        keyConfigured: true,
        apiReachable: false,
        keyValid: false,
        message: error instanceof Error ? error.message : 'Shippo health check failed',
      }
    }
  }
}
