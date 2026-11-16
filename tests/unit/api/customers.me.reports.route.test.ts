import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireAuthMock = vi.fn()
const createServiceRoleClientMock = vi.fn()

vi.mock('@/lib/supabase/require-auth', () => ({
  requireAuth: requireAuthMock,
  unauthorized: () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
}))
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: createServiceRoleClientMock,
}))
vi.mock('@/lib/pdf', () => ({ generateOrderHistoryPDF: vi.fn() }))
vi.mock('@/lib/tenant-brand-label', () => ({ resolveTenantBrandLabel: vi.fn() }))

const ORDERS = [
  { order_number: 'PO-1', type: 'trade_in', status: 'submitted', quoted_amount: 91.33, total_amount: null, total_quantity: 1, created_at: '2026-11-11T00:00:00Z' },
  { order_number: 'PO-2', type: 'trade_in', status: 'closed', quoted_amount: null, total_amount: 50, total_quantity: 1, created_at: '2026-11-10T00:00:00Z' },
]

// An org holding TWO customer rows — the shape that made .maybeSingle() return
// null and zero the whole reports page.
const CUSTOMERS = [
  { id: 'cust-old', organization_id: 'org-1', company_name: 'Acme', contact_name: 'A', contact_email: 'a@x.co', is_active: true },
  { id: 'cust-new', organization_id: 'org-1', company_name: 'Acme 2', contact_name: 'B', contact_email: 'b@x.co', is_active: true },
]

function makeServiceRole() {
  return {
    rpc: vi.fn().mockResolvedValue({ data: null }),
    from: vi.fn().mockImplementation((table: string) => {
      const filters: Record<string, unknown> = {}
      let head = false
      let limit: number | null = null
      let single = false
      const q: any = {
        select: vi.fn((_c: string, o?: { head?: boolean }) => { head = Boolean(o?.head); return q }),
        eq: vi.fn((f: string, v: unknown) => { filters[f] = v; return q }),
        not: vi.fn(() => { filters.activeOnly = true; return q }),
        order: vi.fn(() => q),
        limit: vi.fn((n: number) => { limit = n; return q }),
        maybeSingle: vi.fn(() => { single = true; return q }),
        single: vi.fn(() => { single = true; return q }),
        then: (resolve: (v: unknown) => unknown) => {
          let result: unknown
          if (table === 'customers') {
            const rows = CUSTOMERS.filter((c) => !filters.id || c.id === filters.id)
            if (single) {
              // PostgREST: more than one row for a single-object request is an error.
              result = rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { code: 'PGRST116' } }
            } else {
              result = { data: limit ? rows.slice(0, limit) : rows, error: null }
            }
          } else if (table === 'orders') {
            const rows = filters.customer_id === 'cust-old' ? ORDERS : []
            const visible = filters.activeOnly ? rows.filter((o) => o.status !== 'closed') : rows
            result = head ? { data: null, count: visible.length, error: null } : { data: visible, error: null }
          } else if (table === 'customer_assets') {
            const total = filters.customer_id === 'cust-old' ? 1 : 0
            result = { data: null, count: filters.status && filters.status !== 'registered' ? 0 : total, error: null }
          } else {
            result = single ? { data: null, error: null } : { data: [], count: 0, error: null }
          }
          return Promise.resolve(result).then(resolve)
        },
      }
      return q
    }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAuthMock.mockResolvedValue({
    effectiveRole: 'customer',
    profile: { id: 'u1', organization_id: 'org-1', tenant_id: null },
  })
  createServiceRoleClientMock.mockImplementation(makeServiceRole)
})

describe('GET /api/customers/me/reports', () => {
  it('reports real counters for an org with more than one customer row', async () => {
    const { GET } = await import('@/app/api/customers/me/reports/route')
    const res = await GET()
    expect(res.status).toBe(200)
    const { data } = await res.json()
    expect(data.orders).toEqual({ total: 2, active: 1 })
    expect(data.assets.total).toBe(1)
    expect(data.assets.registered).toBe(1)
    expect(data.tradeInValue).toBeCloseTo(141.33)
  })

  it('rejects non-customer roles', async () => {
    requireAuthMock.mockResolvedValue({ effectiveRole: 'vendor', profile: { organization_id: 'org-1' } })
    const { GET } = await import('@/app/api/customers/me/reports/route')
    expect((await GET()).status).toBe(403)
  })
})

describe('GET /api/customers/me/orders/export', () => {
  it('exports the order history CSV for an org with more than one customer row', async () => {
    const { GET } = await import('@/app/api/customers/me/orders/export/route')
    const { NextRequest } = await import('next/server')
    const res = await GET(new NextRequest('http://localhost/api/customers/me/orders/export?format=csv'))
    expect(res.status).toBe(200)
    const body = await res.text()
    expect(body).toContain('PO-1')
    expect(body).toContain('PO-2')
  })
})
