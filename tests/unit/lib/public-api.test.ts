import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'
import { parsePage, parseIsoParam, asRows, asRow, PAGE_DEFAULT, PAGE_MAX } from '@/lib/public-api'
import {
  serializeOrder, serializeOrderDetail, serializeCustomer, serializeAsset,
  ORDER_COLUMNS, CUSTOMER_COLUMNS, ASSET_COLUMNS,
} from '@/lib/public-api/serializers'

const req = (qs: string) => new NextRequest(`http://x/api/v1/orders${qs}`)

describe('parsePage', () => {
  it('defaults when absent or garbage', () => {
    expect(parsePage(req(''))).toEqual({ limit: PAGE_DEFAULT, offset: 0 })
    expect(parsePage(req('?limit=abc&offset=-3'))).toEqual({ limit: PAGE_DEFAULT, offset: 0 })
    expect(parsePage(req('?limit=0'))).toEqual({ limit: PAGE_DEFAULT, offset: 0 })
  })
  it('caps limit at PAGE_MAX and honours offset', () => {
    expect(parsePage(req('?limit=999&offset=120'))).toEqual({ limit: PAGE_MAX, offset: 120 })
    expect(parsePage(req('?limit=7'))).toEqual({ limit: 7, offset: 0 })
  })
})

describe('parseIsoParam', () => {
  it('distinguishes absent (undefined) from malformed (null) from valid (ISO)', () => {
    expect(parseIsoParam(req(''), 'updated_since')).toBeUndefined()
    expect(parseIsoParam(req('?updated_since='), 'updated_since')).toBeUndefined()
    expect(parseIsoParam(req('?updated_since=yesterday'), 'updated_since')).toBeNull()
    expect(parseIsoParam(req('?updated_since=2026-09-01T00:00:00Z'), 'updated_since')).toBe('2026-09-01T00:00:00.000Z')
  })
})

describe('asRows / asRow', () => {
  it('never throws on the shapes PostgREST can hand back', () => {
    expect(asRows(null)).toEqual([])
    expect(asRows('error')).toEqual([])
    expect(asRows([{ a: 1 }])).toEqual([{ a: 1 }])
    expect(asRow(null)).toBeNull()
    expect(asRow('error')).toBeNull()
    expect(asRow({ a: 1 })).toEqual({ a: 1 })
  })
})

describe('serializers are strict whitelists', () => {
  // The whole point of the serializer layer: a column that leaks into the
  // SELECT by accident still never leaves the API.
  const leaky = {
    id: 'o1', order_number: 'TI-1', type: 'trade_in', status: 'quoted',
    internal_notes: 'SECRET', pricing_metadata: { margin: 0.3 }, vendor_id: 'v1',
    metadata: { commission: 100 }, created_at: 'x', updated_at: 'y',
  }

  it('order: drops internal_notes, pricing_metadata, vendor_id, metadata', () => {
    const out = serializeOrder(leaky)
    expect(out).not.toHaveProperty('internal_notes')
    expect(out).not.toHaveProperty('pricing_metadata')
    expect(out).not.toHaveProperty('vendor_id')
    expect(out).not.toHaveProperty('metadata')
    expect(out.order_number).toBe('TI-1')
    // Every whitelisted key is present (null when absent) so clients get a stable shape.
    for (const k of ORDER_COLUMNS.split(', ')) expect(out).toHaveProperty(k)
  })

  it('order detail: items carry a flattened device and drop pricing_metadata', () => {
    const out = serializeOrderDetail({
      ...leaky,
      items: [{ id: 'i1', device_id: 'd1', quantity: 2, pricing_metadata: { x: 1 }, device: { id: 'd1', make: 'Apple', model: 'iPhone 15', variant: null, category: 'phone', is_active: true } }],
    })
    expect(out.items).toHaveLength(1)
    expect(out.items[0]).not.toHaveProperty('pricing_metadata')
    expect(out.items[0].device).toEqual({ id: 'd1', make: 'Apple', model: 'iPhone 15', variant: null, category: 'phone' })
  })

  it('order detail: tolerates PostgREST returning the device join as an array', () => {
    const out = serializeOrderDetail({ ...leaky, items: [{ id: 'i1', device: [{ id: 'd1', make: 'A', model: 'B' }] }] })
    expect(out.items[0].device).toMatchObject({ id: 'd1', make: 'A', model: 'B' })
  })

  it('customer: drops credit_limit, payment_terms, notes, addresses', () => {
    const out = serializeCustomer({
      id: 'c1', company_name: 'Acme', credit_limit: 50000, payment_terms: 'net30', notes: 'late payer',
      billing_address: { line1: 'x' }, organization_id: 'org',
    })
    for (const k of ['credit_limit', 'payment_terms', 'notes', 'billing_address', 'organization_id']) {
      expect(out).not.toHaveProperty(k)
    }
    for (const k of CUSTOMER_COLUMNS.split(', ')) expect(out).toHaveProperty(k)
  })

  it('asset: drops notes and tenant_id, keeps the device join', () => {
    const out = serializeAsset({ id: 'a1', label: 'Laptop 12', notes: 'x', tenant_id: 't', device: null })
    expect(out).not.toHaveProperty('notes')
    expect(out).not.toHaveProperty('tenant_id')
    expect(out.device).toBeNull()
    for (const k of ASSET_COLUMNS.split(', ')) expect(out).toHaveProperty(k)
  })
})

describe('every v1 route is tenant-scoped through the shared helper', () => {
  // requireApiKey() hands back a SERVICE-ROLE client, which bypasses RLS. The
  // only thing keeping one tenant's key out of another tenant's rows is that
  // every query starts from tenantQuery(). This pins that: a v1 route that
  // reaches for supabase.from() directly fails here before it ships.
  const root = path.resolve(__dirname, '../../../src/app/api/v1')
  const routes: string[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (e.name === 'route.ts') routes.push(p)
    }
  }
  walk(root)

  it('finds the v1 routes', () => {
    expect(routes.length).toBeGreaterThanOrEqual(6)
  })

  for (const file of routes) {
    const rel = path.relative(root, file).replace(/\\/g, '/')
    const src = fs.readFileSync(file, 'utf8')
    const isMe = rel === 'me/route.ts'

    it(`${rel}: authorizes via authorizeV1 and only reads`, () => {
      expect(src).toMatch(/authorizeV1\(/)
      expect(src).not.toMatch(/export async function (POST|PATCH|PUT|DELETE)/)
    })

    if (!isMe) {
      it(`${rel}: never queries a tenant table outside tenantQuery()`, () => {
        expect(src).toMatch(/tenantQuery\(/)
        expect(src).not.toMatch(/\.from\(/)
      })
    } else {
      it(`${rel}: /me only reads the key's own tenant row`, () => {
        expect(src).toMatch(/\.from\('tenants'\)[\s\S]*\.eq\('id', ctx\.tenantId\)/)
      })
    }
  }
})
