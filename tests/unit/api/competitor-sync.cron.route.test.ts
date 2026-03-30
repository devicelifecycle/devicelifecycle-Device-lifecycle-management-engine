import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const createServiceRoleClientMock = vi.fn()

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: createServiceRoleClientMock,
}))

type Row = Record<string, unknown>

function makeSupabaseMock(options?: { existingId?: string | null; upsertErrorCode?: string | null }) {
  const capturedEqCalls: Array<{ column: string; value: unknown }> = []
  const insertedRows: Row[] = []
  const updatedRows: Row[] = []
  const upsertRows: Row[] = []

  const selectChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockImplementation((column: string, value: unknown) => {
      capturedEqCalls.push({ column, value })
      return selectChain
    }),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({
      data: options?.existingId ? { id: options.existingId } : null,
      error: null,
    }),
  }

  const updateEq = vi.fn().mockResolvedValue({ error: null })
  const updateChain = {
    eq: updateEq,
  }

  const table = {
    select: selectChain.select,
    eq: selectChain.eq,
    limit: selectChain.limit,
    single: selectChain.single,
    upsert: vi.fn().mockImplementation((row: Row) => {
      upsertRows.push(row)
      if (options?.upsertErrorCode) {
        return Promise.resolve({ error: { code: options.upsertErrorCode, message: 'Upsert failed' } })
      }
      return Promise.resolve({ error: null })
    }),
    insert: vi.fn().mockImplementation((row: Row) => {
      insertedRows.push(row)
      return Promise.resolve({ error: null })
    }),
    update: vi.fn().mockImplementation((row: Row) => {
      updatedRows.push(row)
      return updateChain
    }),
  }

  return {
    supabase: {
      from: vi.fn().mockReturnValue(table),
    },
    capturedEqCalls,
    insertedRows,
    updatedRows,
    upsertRows,
    updateEq,
  }
}

describe('GET /api/cron/competitor-sync', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
    ;(process.env as Record<string, string | undefined>).CRON_SECRET = ' secret123 \n'
    ;(process.env as Record<string, string | undefined>).COMPETITOR_SYNC_ENABLED = ' true \n'
    ;(process.env as Record<string, string | undefined>).COMPETITOR_CSV_URL = ' https://example.com/prices.csv \n'
  })

  it('returns 401 when auth header is invalid', async () => {
    const { supabase } = makeSupabaseMock()
    createServiceRoleClientMock.mockReturnValue(supabase)

    const { GET } = await import('@/app/api/cron/competitor-sync/route')
    const response = await GET(new NextRequest('http://localhost/api/cron/competitor-sync', {
      headers: { authorization: 'Bearer wrong' },
    }))

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' })
  })

  it('upserts rows with condition via conflict key', async () => {
    const { supabase, upsertRows } = makeSupabaseMock({ existingId: null })
    createServiceRoleClientMock.mockReturnValue(supabase)

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue(
        [
          'device_id,storage,competitor_name,condition,trade_in_price,sell_price',
          'd-1,128GB,Bell,fair,310,450',
        ].join('\n')
      ),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { GET } = await import('@/app/api/cron/competitor-sync/route')
    const response = await GET(new NextRequest('http://localhost/api/cron/competitor-sync', {
      headers: { authorization: 'Bearer secret123' },
    }))

    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.success).toBe(true)
    expect(json.imported).toBe(1)

    expect(upsertRows[0]).toMatchObject({
      device_id: 'd-1',
      storage: '128GB',
      competitor_name: 'Bell',
      condition: 'fair',
      trade_in_price: 310,
      sell_price: 450,
    })

    vi.unstubAllGlobals()
  })

  it('defaults condition to good when omitted in CSV', async () => {
    const { supabase, upsertRows } = makeSupabaseMock({ existingId: null })
    createServiceRoleClientMock.mockReturnValue(supabase)

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue(
        [
          'device_id,storage,competitor_name,trade_in_price,sell_price',
          'd-2,256GB,Telus,300,430',
        ].join('\n')
      ),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { GET } = await import('@/app/api/cron/competitor-sync/route')
    const response = await GET(new NextRequest('http://localhost/api/cron/competitor-sync', {
      headers: { authorization: 'Bearer secret123' },
    }))

    expect(response.status).toBe(200)
    expect(upsertRows[0]).toMatchObject({
      competitor_name: 'Telus',
      condition: 'good',
    })

    vi.unstubAllGlobals()
  })

  it('parses quoted CSV cells correctly', async () => {
    const { supabase, upsertRows } = makeSupabaseMock({ existingId: null })
    createServiceRoleClientMock.mockReturnValue(supabase)

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: vi.fn().mockResolvedValue(
        [
          'device_id,storage,competitor_name,condition,trade_in_price,sell_price',
          'd-3,"128GB","Bell, Canada",excellent,325,470',
        ].join('\n')
      ),
    })
    vi.stubGlobal('fetch', fetchMock)

    const { GET } = await import('@/app/api/cron/competitor-sync/route')
    const response = await GET(new NextRequest('http://localhost/api/cron/competitor-sync', {
      headers: { authorization: 'Bearer secret123' },
    }))

    expect(response.status).toBe(200)
    expect(upsertRows[0]).toMatchObject({
      competitor_name: 'Bell, Canada',
      condition: 'excellent',
    })

    vi.unstubAllGlobals()
  })

  it('skips when sync is disabled with whitespace in the env value', async () => {
    const { supabase } = makeSupabaseMock()
    createServiceRoleClientMock.mockReturnValue(supabase)
    ;(process.env as Record<string, string | undefined>).COMPETITOR_SYNC_ENABLED = ' false \n'

    const { GET } = await import('@/app/api/cron/competitor-sync/route')
    const response = await GET(new NextRequest('http://localhost/api/cron/competitor-sync', {
      headers: { authorization: 'Bearer secret123' },
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      skipped: true,
    })
  })
})
