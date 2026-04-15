
import { describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'

describe('POST /api/shipments/[id]/purchase-label', () => {
  it('returns 501 — in-app label purchase is disabled', async () => {
    const { POST } = await import('@/app/api/shipments/[id]/purchase-label/route')

    const response = await POST(
      new NextRequest('http://localhost/api/shipments/shipment-1/purchase-label', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ id: 'shipment-1' }) }
    )

    expect(response.status).toBe(501)
    await expect(response.json()).resolves.toEqual({
      error: 'In-app label purchase is not enabled. Enter tracking manually.',
    })
  })
})
