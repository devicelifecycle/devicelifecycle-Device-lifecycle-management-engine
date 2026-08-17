import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted so the mock fn exists before the hoisted vi.mock factory runs.
const { createServerSupabaseClientMock } = vi.hoisted(() => ({ createServerSupabaseClientMock: vi.fn() }))
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}))

import { IMEIService } from '@/services/imei.service'

/**
 * Builds a fake supabase client whose Nth `.from()` call resolves to the Nth
 * entry in `responses` (last entry repeats for any extra calls, e.g. chunked
 * inserts). Every chain method returns the same thenable builder so both
 * `await query.eq(...).single()` and `await query.eq(...)` (list queries)
 * resolve correctly, matching how IMEIService actually calls supabase-js.
 */
function makeSupabaseMock(responses: Array<{ data?: unknown; error?: unknown }>) {
  let i = 0
  const nextResponse = () => responses[Math.min(i++, responses.length - 1)] ?? { data: null, error: null }

  const builder = () => {
    const res = nextResponse()
    const b: Record<string, unknown> = {
      select: vi.fn(() => b),
      eq: vi.fn(() => b),
      in: vi.fn(() => b),
      order: vi.fn(() => b),
      single: vi.fn(() => Promise.resolve(res)),
      insert: vi.fn(() => Promise.resolve(res)),
      then: (resolve: (v: unknown) => void) => Promise.resolve(res).then(resolve),
    }
    return b
  }

  return { from: vi.fn(() => builder()) }
}

beforeEach(() => vi.clearAllMocks())

describe('IMEIService.getOrderFulfillment', () => {
  it('computes outstanding and groups received devices by source vendor', async () => {
    createServerSupabaseClientMock.mockResolvedValue(makeSupabaseMock([
      { data: { total_quantity: 1000 } },
      { data: [
        { source_vendor_id: 'v1', vendor: { company_name: 'A1 Wireless' } },
        { source_vendor_id: 'v1', vendor: { company_name: 'A1 Wireless' } },
        { source_vendor_id: 'v2', vendor: { company_name: 'Bridge Wireless' } },
        { source_vendor_id: null, vendor: null },
      ] },
    ]))

    const result = await IMEIService.getOrderFulfillment('order-1')

    expect(result.ordered).toBe(1000)
    expect(result.received).toBe(4)
    expect(result.outstanding).toBe(996)
    expect(result.byVendor).toEqual([
      { vendorId: 'v1', name: 'A1 Wireless', count: 2 },
      { vendorId: 'v2', name: 'Bridge Wireless', count: 1 },
      { vendorId: null, name: 'Unattributed', count: 1 },
    ])
  })

  it('never reports a negative outstanding balance when over-received', async () => {
    createServerSupabaseClientMock.mockResolvedValue(makeSupabaseMock([
      { data: { total_quantity: 5 } },
      { data: Array.from({ length: 8 }, () => ({ source_vendor_id: 'v1', vendor: { company_name: 'A1' } })) },
    ]))

    const result = await IMEIService.getOrderFulfillment('order-2')
    expect(result.received).toBe(8)
    expect(result.outstanding).toBe(0)
  })

  it('treats a missing order total as zero ordered', async () => {
    createServerSupabaseClientMock.mockResolvedValue(makeSupabaseMock([
      { data: null },
      { data: [] },
    ]))

    const result = await IMEIService.getOrderFulfillment('order-3')
    expect(result).toEqual({ ordered: 0, received: 0, outstanding: 0, byVendor: [] })
  })
})

describe('IMEIService.bulkCreateFromVendor', () => {
  it('skips IMEIs already recorded for this order and inserts the rest', async () => {
    createServerSupabaseClientMock.mockResolvedValue(makeSupabaseMock([
      { data: [{ imei: 'ALREADY-1' }] }, // existing lookup
      { error: null },                   // insert
    ]))

    const result = await IMEIService.bulkCreateFromVendor({
      orderId: 'order-1',
      vendorId: 'vendor-1',
      warrantyDays: 90,
      rows: [{ imei: 'ALREADY-1' }, { imei: 'NEW-1' }, { imei: 'NEW-2' }],
    })

    expect(result).toEqual({ inserted: 2, skipped: 1 })
  })

  it('inserts nothing and reports all skipped when every IMEI already exists', async () => {
    createServerSupabaseClientMock.mockResolvedValue(makeSupabaseMock([
      { data: [{ imei: 'A' }, { imei: 'B' }] },
    ]))

    const result = await IMEIService.bulkCreateFromVendor({
      orderId: 'order-1',
      vendorId: 'vendor-1',
      warrantyDays: 90,
      rows: [{ imei: 'A' }, { imei: 'B' }],
    })

    expect(result).toEqual({ inserted: 0, skipped: 2 })
  })

  it('surfaces a database error from the insert instead of swallowing it', async () => {
    createServerSupabaseClientMock.mockResolvedValue(makeSupabaseMock([
      { data: [] },
      { error: { message: 'constraint violation' } },
    ]))

    await expect(IMEIService.bulkCreateFromVendor({
      orderId: 'order-1',
      vendorId: 'vendor-1',
      warrantyDays: 30,
      rows: [{ imei: 'X' }],
    })).rejects.toThrow('constraint violation')
  })
})
