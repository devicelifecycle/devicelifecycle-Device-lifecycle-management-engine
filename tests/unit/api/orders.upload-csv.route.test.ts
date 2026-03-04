// ============================================================================
// CSV UPLOAD SMOKE TEST — Real data from template screenshots
// ============================================================================

import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock Supabase
const mockInsert = vi.fn()
const mockSelect = vi.fn()
const mockSingle = vi.fn()
const mockRpc = vi.fn()
const mockIlike = vi.fn()
const mockLimit = vi.fn()
const mockEq = vi.fn()

const mockSupabase = {
  auth: {
    getUser: vi.fn().mockResolvedValue({
      data: { user: { id: 'user-1' } },
    }),
  },
  from: vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { role: 'admin', organization_id: 'org-1' },
        }),
      }),
    }),
    insert: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: { id: 'order-1', order_number: 'ORD-20260303-0001' },
          error: null,
        }),
      }),
    }),
    ilike: vi.fn().mockReturnValue({
      ilike: vi.fn().mockReturnValue({
        limit: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { id: 'device-1' } }),
        }),
      }),
    }),
  }),
  rpc: vi.fn().mockResolvedValue({ data: 'ORD-20260303-0001' }),
}

// Track what gets inserted
let insertedItems: Record<string, unknown>[] = []

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: () => {
    const supabase = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
        }),
      },
      rpc: vi.fn().mockResolvedValue({ data: 'ORD-20260303-0001' }),
      from: (table: string) => {
        if (table === 'users') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({
                  data: { role: 'admin', organization_id: 'org-1' },
                }),
              }),
            }),
          }
        }
        if (table === 'customers') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({
                  data: { id: 'cust-1', organization_id: 'org-1', is_active: true },
                }),
              }),
            }),
          }
        }
        if (table === 'orders') {
          return {
            insert: () => ({
              select: () => ({
                single: () => Promise.resolve({
                  data: { id: 'order-1', order_number: 'ORD-20260303-0001' },
                  error: null,
                }),
              }),
            }),
          }
        }
        if (table === 'order_items') {
          return {
            insert: (items: Record<string, unknown>[]) => {
              insertedItems = items
              return Promise.resolve({ error: null })
            },
          }
        }
        if (table === 'device_catalog') {
          return {
            select: () => ({
              ilike: (_col: string, _val: string) => ({
                ilike: (_col2: string, _val2: string) => ({
                  limit: () => ({
                    single: () => Promise.resolve({ data: { id: 'device-1' } }),
                  }),
                }),
              }),
            }),
          }
        }
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null }) }) }),
          insert: () => Promise.resolve({ error: null }),
        }
      },
    }
    return supabase
  },
}))

describe('CSV Upload — Auto-detect and Smart Mapping', () => {
  beforeEach(() => {
    insertedItems = []
  })

  // =====================================================================
  // TEST 1: Trade-In Template (from screenshot)
  // =====================================================================
  it('parses Trade-In template with IMEI and faults', async () => {
    const { POST } = await import('@/app/api/orders/upload-csv/route')

    const tradeInRows = [
      {
        'Make*': 'Google',
        'Model*': 'Pixel 8',
        'Storage/GB*': '128',
        'IMEI': '351545707040647',
        'Colour': '',
        'Condition': '',
        'Faults/Notes': '',
      },
      {
        'Make*': 'Apple',
        'Model*': 'iPhone 11',
        'Storage/GB*': '64',
        'IMEI': '356806119003267',
        'Colour': '',
        'Condition': '',
        'Faults/Notes': 'Cracked Screen',
      },
    ]

    const request = new NextRequest('http://localhost/api/orders/upload-csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: tradeInRows,
        columns: ['Make*', 'Model*', 'Storage/GB*', 'IMEI', 'Colour', 'Condition', 'Faults/Notes'],
        customer_id: '00000000-0000-0000-0000-000000000001',
      }),
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(json.template_detected).toBe('trade_in')
    expect(json.items_created).toBe(2)
    expect(json.total_quantity).toBe(2) // Each row = qty 1

    // Verify first item: Google Pixel 8
    expect(insertedItems[0]).toMatchObject({
      order_id: 'order-1',
      quantity: 1,
      storage: '128',
      imei: '351545707040647',
    })

    // Verify second item: Apple iPhone 11 with Cracked Screen
    expect(insertedItems[1]).toMatchObject({
      order_id: 'order-1',
      quantity: 1,
      storage: '64',
      imei: '356806119003267',
      claimed_condition: 'poor', // "Cracked Screen" → poor
      faults: 'Cracked Screen',
    })
  })

  // =====================================================================
  // TEST 2: CPO Request Template (from screenshot)
  // =====================================================================
  it('parses CPO template with bulk quantity', async () => {
    const { POST } = await import('@/app/api/orders/upload-csv/route')

    const cpoRows = [
      {
        'Make*': 'Samsung',
        'Model*': 'A36',
        'Storage/GB*': '128',
        'Condition': 'New',
        'Quantity': '600',
      },
    ]

    const request = new NextRequest('http://localhost/api/orders/upload-csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: cpoRows,
        columns: ['Make*', 'Model*', 'Storage/GB*', 'Condition', 'Quantity'],
        customer_id: '00000000-0000-0000-0000-000000000001',
      }),
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(json.template_detected).toBe('cpo')
    expect(json.order_type).toBe('cpo')
    expect(json.total_quantity).toBe(600)
    expect(json.items_created).toBe(1)

    expect(insertedItems[0]).toMatchObject({
      order_id: 'order-1',
      quantity: 600,
      storage: '128',
      claimed_condition: 'new',
    })
  })

  // =====================================================================
  // TEST 3: Vendor Inventory (MacBooks from screenshot)
  // =====================================================================
  it('parses Vendor Inventory template with CPU/RAM/serial numbers', async () => {
    const { POST } = await import('@/app/api/orders/upload-csv/route')

    const vendorRows = [
      {
        'Product': 'MacBook Pro 16-inch',
        'Year': '2019',
        'Model': 'A2141',
        'Screen Size': '16-inch',
        'CPU': 'intel i7',
        'RAM': '16 GB',
        'Storage': '512 GB',
        'Sample S/N': 'SC02F70N8MD6M',
        'Accessories. Ex., Charger?': 'Original Charger and cable',
        'Condition': 'Reset and cleaned.',
      },
      {
        'Product': 'MacBook Pro 16-inch',
        'Year': '2019',
        'Model': 'A2141',
        'Screen Size': '16-inch',
        'CPU': 'intel i7',
        'RAM': '16 GB',
        'Storage': '512 GB',
        'Sample S/N': 'SC02F72NQMD6M',
        'Accessories. Ex., Charger?': 'Original Charger and cable',
        'Condition': 'Reset and cleaned. Battery can\'t hold the power.',
      },
      {
        'Product': 'MacBook Pro 16-inch',
        'Year': '2019',
        'Model': 'A2141',
        'Screen Size': '16-inch',
        'CPU': 'intel i7',
        'RAM': '16 GB',
        'Storage': '512 GB',
        'Sample S/N': 'SC02CT3TRMD6M',
        'Accessories. Ex., Charger?': 'Original Charger but no cable',
        'Condition': 'Reset and cleaned. Battery can\'t hold the power.',
      },
      {
        'Product': 'MacBook Pro 16-inch',
        'Year': '2019',
        'Model': 'A2141',
        'Screen Size': '16-inch',
        'CPU': 'intel i7',
        'RAM': '16 GB',
        'Storage': '512 GB',
        'Sample S/N': 'SC02CT3WVMD6M',
        'Accessories. Ex., Charger?': 'Original Charger and cable',
        'Condition': 'Reset and cleaned. Battery can\'t hold the power.',
      },
      {
        'Product': 'MacBook Pro 16-inch',
        'Year': '2019',
        'Model': 'A2141',
        'Screen Size': '16-inch',
        'CPU': 'intel i7',
        'RAM': '16 GB',
        'Storage': '512 GB',
        'Sample S/N': 'SC02CT412MD6M',
        'Accessories. Ex., Charger?': 'Original Charger and cable',
        'Condition': 'Reset and cleaned. Battery can\'t hold the power. scratch on the top cover.',
      },
    ]

    const columns = [
      'Product', 'Year', 'Model', 'Screen Size', 'CPU', 'RAM',
      'Storage', 'Sample S/N', 'Accessories. Ex., Charger?', 'Condition',
    ]

    const request = new NextRequest('http://localhost/api/orders/upload-csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: vendorRows,
        columns,
        customer_id: '00000000-0000-0000-0000-000000000001',
      }),
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(json.template_detected).toBe('vendor_inventory')
    expect(json.items_created).toBe(5)
    expect(json.total_quantity).toBe(5) // Each row = 1 device

    // Verify first item: clean MacBook
    const item1 = insertedItems[0] as Record<string, unknown>
    expect(item1.quantity).toBe(1)
    expect(item1.storage).toBe('512')
    expect(item1.serial_number).toBe('SC02F70N8MD6M')
    expect(item1.cpu).toBe('intel i7')
    expect(item1.ram).toBe('16 GB')
    expect(item1.screen_size).toBe('16-inch')
    expect(item1.year).toBe(2019)
    expect(item1.accessories).toBe('Original Charger and cable')
    expect(item1.claimed_condition).toBe('good') // "Reset and cleaned" → good

    // Verify second item: MacBook with battery issue
    const item2 = insertedItems[1] as Record<string, unknown>
    expect(item2.serial_number).toBe('SC02F72NQMD6M')
    expect(item2.claimed_condition).toBe('fair') // "Battery can't hold the power" → fair

    // Verify fifth item: MacBook with battery + scratch
    const item5 = insertedItems[4] as Record<string, unknown>
    expect(item5.serial_number).toBe('SC02CT412MD6M')
    expect(item5.claimed_condition).toBe('fair') // "Battery can't hold" + "scratch" → fair
  })

  // =====================================================================
  // TEST 4: Condition normalization
  // =====================================================================
  it('normalizes free-text conditions to enums correctly', async () => {
    const { POST } = await import('@/app/api/orders/upload-csv/route')

    const rows = [
      { 'Make*': 'Apple', 'Model*': 'iPhone 15', 'Storage/GB*': '256', 'Condition': 'New', 'Faults/Notes': '' },
      { 'Make*': 'Apple', 'Model*': 'iPhone 14', 'Storage/GB*': '128', 'Condition': 'Like new, mint condition', 'Faults/Notes': '' },
      { 'Make*': 'Apple', 'Model*': 'iPhone 13', 'Storage/GB*': '128', 'Condition': 'good', 'Faults/Notes': '' },
      { 'Make*': 'Apple', 'Model*': 'iPhone 12', 'Storage/GB*': '64', 'Condition': 'Battery worn, scratches on back', 'Faults/Notes': '' },
      { 'Make*': 'Apple', 'Model*': 'iPhone 11', 'Storage/GB*': '64', 'Condition': 'Cracked screen, broken back', 'Faults/Notes': '' },
    ]

    const request = new NextRequest('http://localhost/api/orders/upload-csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows,
        columns: ['Make*', 'Model*', 'Storage/GB*', 'Condition', 'Faults/Notes'],
        customer_id: '00000000-0000-0000-0000-000000000001',
      }),
    })

    const response = await POST(request)
    expect(response.status).toBe(201)

    expect((insertedItems[0] as Record<string, unknown>).claimed_condition).toBe('new')
    expect((insertedItems[1] as Record<string, unknown>).claimed_condition).toBe('excellent') // "Like new, mint"
    expect((insertedItems[2] as Record<string, unknown>).claimed_condition).toBe('good')
    expect((insertedItems[3] as Record<string, unknown>).claimed_condition).toBe('fair') // "Battery worn, scratches"
    expect((insertedItems[4] as Record<string, unknown>).claimed_condition).toBe('poor') // "Cracked, broken"
  })

  // =====================================================================
  // TEST 5: Brand extraction from Product name
  // =====================================================================
  it('extracts brand from Product column for vendor inventory', async () => {
    const { POST } = await import('@/app/api/orders/upload-csv/route')

    const rows = [
      { 'Product': 'MacBook Pro 16-inch', 'CPU': 'M1 Max', 'RAM': '32 GB', 'Storage': '1 TB', 'Condition': 'Excellent' },
      { 'Product': 'Galaxy S24 Ultra', 'CPU': 'Snapdragon', 'RAM': '12 GB', 'Storage': '256 GB', 'Condition': 'New' },
      { 'Product': 'ThinkPad X1 Carbon', 'CPU': 'i7-1365U', 'RAM': '16 GB', 'Storage': '512 GB', 'Condition': 'Good' },
    ]

    const request = new NextRequest('http://localhost/api/orders/upload-csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows,
        columns: ['Product', 'CPU', 'RAM', 'Storage', 'Condition'],
        customer_id: '00000000-0000-0000-0000-000000000001',
      }),
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(json.template_detected).toBe('vendor_inventory')
    expect(json.items_created).toBe(3)
  })

  // =====================================================================
  // TEST 6: Validation errors
  // =====================================================================
  it('returns validation errors for missing required fields', async () => {
    const { POST } = await import('@/app/api/orders/upload-csv/route')

    const rows = [
      { 'Make*': '', 'Model*': 'Pixel 8', 'Storage/GB*': '128' }, // Missing make
      { 'Make*': 'Apple', 'Model*': '', 'Storage/GB*': '64' },    // Missing model
    ]

    const request = new NextRequest('http://localhost/api/orders/upload-csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows,
        columns: ['Make*', 'Model*', 'Storage/GB*'],
        customer_id: '00000000-0000-0000-0000-000000000001',
      }),
    })

    const response = await POST(request)
    const json = await response.json()

    expect(response.status).toBe(400)
    expect(json.error).toBe('Validation errors')
    expect(json.details.length).toBeGreaterThan(0)
    expect(json.details.some((d: { message: string }) => d.message.includes('Make/Brand'))).toBe(true)
    expect(json.details.some((d: { message: string }) => d.message.includes('Model'))).toBe(true)
  })

  // =====================================================================
  // TEST 7: Storage GB suffix stripping
  // =====================================================================
  it('strips GB suffix from storage values', async () => {
    const { POST } = await import('@/app/api/orders/upload-csv/route')

    const rows = [
      { 'Make*': 'Apple', 'Model*': 'iPhone 15', 'Storage/GB*': '512 GB', 'Condition': 'New' },
    ]

    const request = new NextRequest('http://localhost/api/orders/upload-csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows,
        columns: ['Make*', 'Model*', 'Storage/GB*', 'Condition'],
        customer_id: '00000000-0000-0000-0000-000000000001',
      }),
    })

    const response = await POST(request)
    expect(response.status).toBe(201)
    expect((insertedItems[0] as Record<string, unknown>).storage).toBe('512')
  })
})
