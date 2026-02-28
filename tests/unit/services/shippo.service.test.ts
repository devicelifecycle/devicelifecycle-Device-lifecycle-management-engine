import { createHmac } from 'crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ShippoService } from '@/services/shippo.service'

describe('ShippoService', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete (process.env as Record<string, string | undefined>).SHIPPO_API_KEY
    delete (process.env as Record<string, string | undefined>).SHIPPO_WEBHOOK_SECRET
  })

  it('maps tracking statuses to internal shipment statuses', () => {
    expect(ShippoService.mapShippoTrackingStatusToInternal('DELIVERED')).toBe('delivered')
    expect(ShippoService.mapShippoTrackingStatusToInternal('OUT_FOR_DELIVERY')).toBe('out_for_delivery')
    expect(ShippoService.mapShippoTrackingStatusToInternal('TRANSIT')).toBe('in_transit')
    expect(ShippoService.mapShippoTrackingStatusToInternal('PICKED_UP')).toBe('picked_up')
    expect(ShippoService.mapShippoTrackingStatusToInternal('FAILURE')).toBe('exception')
    expect(ShippoService.mapShippoTrackingStatusToInternal('UNKNOWN')).toBe('label_created')
  })

  it('purchases label and chooses cheapest preferred carrier rate', async () => {
    ;(process.env as Record<string, string | undefined>).SHIPPO_API_KEY = 'shippo_test_key'

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          object_id: 'shp_123',
          rates: [
            { object_id: 'rate_ups', amount: '12.00', currency: 'USD', provider: 'UPS' },
            { object_id: 'rate_fedex_fast', amount: '11.00', currency: 'USD', provider: 'FedEx', servicelevel: { token: 'fedex_2_day' } },
            { object_id: 'rate_fedex_ground', amount: '8.00', currency: 'USD', provider: 'FedEx', servicelevel: { token: 'fedex_ground' } },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          object_id: 'tx_123',
          status: 'SUCCESS',
          tracking_number: 'TRACK123',
          tracking_status: 'PRE_TRANSIT',
          tracking_url_provider: 'https://track.example/TRACK123',
          eta: '2026-03-01T00:00:00.000Z',
          label_url: 'https://label.example/label.png',
          label_file: 'https://label.example/label.pdf',
        }),
      })

    vi.stubGlobal('fetch', fetchMock)

    const result = await ShippoService.purchaseLabel({
      fromAddress: {
        name: 'COE Warehouse',
        street1: '123 COE Dr',
        city: 'Austin',
        state: 'TX',
        postal_code: '73301',
        country: 'US',
      },
      toAddress: {
        name: 'Customer',
        street1: '555 Main St',
        city: 'Dallas',
        state: 'TX',
        postal_code: '75001',
        country: 'US',
      },
      preferredCarrier: 'FedEx',
      parcel: {
        length: 12,
        width: 8,
        height: 4,
        weight: 2,
      },
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.shippo_shipment_id).toBe('shp_123')
    expect(result.shippo_transaction_id).toBe('tx_123')
    expect(result.shippo_rate_id).toBe('rate_fedex_ground')
    expect(result.tracking_number).toBe('TRACK123')
    expect(result.label_pdf_url).toBe('https://label.example/label.pdf')
    expect(result.rate_amount).toBe(8)
  })

  it('validates webhook signatures when secret is configured', () => {
    ;(process.env as Record<string, string | undefined>).SHIPPO_WEBHOOK_SECRET = 'shippo_secret'

    const body = JSON.stringify({ event: 'track_updated' })
    const validSignature = createHmac('sha256', 'shippo_secret').update(body).digest('hex')

    expect(ShippoService.validateWebhook(body, validSignature)).toBe(true)
    expect(ShippoService.validateWebhook(body, 'bad-signature')).toBe(false)
  })
})
