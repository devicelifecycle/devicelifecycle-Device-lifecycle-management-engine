import { beforeEach, describe, expect, it, vi } from 'vitest'

const createServerSupabaseClientMock = vi.fn()
const createServiceRoleClientMock = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}))

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: createServiceRoleClientMock,
}))

function makeServerSupabase(profile: Record<string, unknown> | null) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'customer-user-1' } } }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table !== 'users') throw new Error(`Unexpected table: ${table}`)
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: profile, error: null }),
      }
    }),
  }
}

function buildOrdersQuery(tableState: {
  counts: { total: number; active: number; quoted: number; completed: number }
  recent: Array<Record<string, unknown>>
  values: Array<{ quoted_amount?: number | null; total_amount?: number | null }>
}) {
  const state: Record<string, unknown> = {}
  let selectClause = ''
  let headMode = false

  const query: any = {
    select: vi.fn().mockImplementation((value: string, options?: { count?: string; head?: boolean }) => {
      selectClause = value
      headMode = Boolean(options?.head)
      return query
    }),
    in: vi.fn().mockImplementation((field: string, value: unknown) => {
      state[field] = value
      return query
    }),
    eq: vi.fn().mockImplementation((field: string, value: unknown) => {
      state[field] = value
      return query
    }),
    not: vi.fn().mockImplementation((field: string, operator: string, value: unknown) => {
      state[`${field}:${operator}`] = value
      return query
    }),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
      let result: unknown

      if (headMode) {
        if (state.status === 'quoted') {
          result = { data: null, count: tableState.counts.quoted, error: null }
        } else if (Array.isArray(state.status)) {
          result = { data: null, count: tableState.counts.completed, error: null }
        } else if (state['status:in']) {
          result = { data: null, count: tableState.counts.active, error: null }
        } else {
          result = { data: null, count: tableState.counts.total, error: null }
        }
      } else if (selectClause === 'quoted_amount, total_amount') {
        result = { data: tableState.values, error: null }
      } else {
        result = { data: tableState.recent, error: null }
      }

      return Promise.resolve(result).then(resolve, reject)
    },
  }

  return query
}

function makeServiceRoleSupabase() {
  let customerSelectCount = 0

  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'customers') {
        const query: any = {
          select: vi.fn().mockImplementation(() => {
            customerSelectCount += 1
            return query
          }),
          eq: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          insert: vi.fn().mockImplementation(() => ({
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: 'customer-1', organization_id: 'org-1', company_name: 'Acme Devices' },
              error: null,
            }),
          })),
          then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => {
            const data = customerSelectCount === 1 ? [] : [{ id: 'customer-1' }]
            return Promise.resolve({ data, error: null }).then(resolve, reject)
          },
        }
        return query
      }

      if (table === 'organizations') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              name: 'Acme Devices',
              contact_email: 'ops@acme.test',
              contact_phone: '+15555550123',
              address: { city: 'Vancouver' },
            },
            error: null,
          }),
        }
      }

      if (table === 'orders') {
        return buildOrdersQuery({
          counts: {
            total: 2,
            active: 1,
            quoted: 1,
            completed: 1,
          },
          values: [
            { quoted_amount: 250, total_amount: 250 },
            { quoted_amount: null, total_amount: 100 },
          ],
          recent: [
            {
              id: 'order-1',
              order_number: 'PO-2026-0001',
              type: 'trade_in',
              status: 'quoted',
              quoted_amount: 250,
              total_amount: 250,
              created_at: '2026-04-10T00:00:00.000Z',
              updated_at: '2026-04-10T00:00:00.000Z',
            },
          ],
        })
      }

      throw new Error(`Unexpected service table: ${table}`)
    }),
  }
}

describe('GET /api/customer/dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('creates a missing customer profile for the org before loading dashboard data', async () => {
    createServerSupabaseClientMock.mockReturnValue(
      makeServerSupabase({
        role: 'customer',
        organization_id: 'org-1',
        full_name: 'Customer One',
        email: 'customer@example.com',
        notification_email: null,
        phone: '+15555550000',
      }),
    )
    createServiceRoleClientMock.mockReturnValue(makeServiceRoleSupabase())

    const { GET } = await import('@/app/api/customer/dashboard/route')
    const response = await GET()
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.total_orders).toBe(2)
    expect(json.active_orders).toBe(1)
    expect(json.quotes_ready).toBe(1)
    expect(json.completed_orders).toBe(1)
    expect(json.visible_value).toBe(350)
    expect(json.recent_orders).toHaveLength(1)
  })
})
