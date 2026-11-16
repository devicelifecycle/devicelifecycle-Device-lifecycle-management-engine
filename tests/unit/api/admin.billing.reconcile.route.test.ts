import { describe, it, expect, vi, beforeEach } from 'vitest'

const updates: Record<string, unknown>[] = []

vi.mock('@/lib/supabase/require-permission', () => ({
  requirePermission: vi.fn().mockResolvedValue({ ok: true }),
}))

function chain(result: unknown) {
  const c: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'gte', 'lte', 'in', 'limit', 'delete', 'insert']) c[m] = vi.fn(() => c)
  c.maybeSingle = vi.fn().mockResolvedValue(result)
  c.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res)
  return c
}

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      if (table === 'invoices') {
        const c = chain({ data: { id: 'inv-1', tenant_id: 't-1', period_start: '2026-11-01', period_end: '2026-11-30', status: 'draft', subscription_fee: 100, credit: 20 }, error: null })
        c.update = vi.fn((payload: Record<string, unknown>) => { updates.push(payload); return chain({ error: null }) })
        return c
      }
      if (table === 'orders') return chain({ data: [{ order_number: 'PO-1', type: 'trade_in', status: 'closed', final_amount: 200 }], error: null })
      if (table === 'organizations') return chain({ data: { address: { state: 'ON', country: 'CA' } }, error: null })
      return chain({ data: { settings: {} }, error: null })
    },
  }),
}))

describe('POST /api/admin/billing/[id]/reconcile', () => {
  beforeEach(() => { updates.length = 0 })

  it('writes real column names (tax_amount/total), keeping the credit', async () => {
    const { POST } = await import('@/app/api/admin/billing/[id]/reconcile/route')
    const res = await POST({} as never, { params: Promise.resolve({ id: 'inv-1' }) })
    expect(res.status).toBe(200)
    const u = updates[0]
    expect(u).toBeDefined()
    // The camelCase helper result was spread in and failed every reconcile.
    expect(u).not.toHaveProperty('taxAmount')
    expect(u).toHaveProperty('tax_amount')
    const taxable = Number(u.commission_total) + 100 - 20
    expect(Number(u.total)).toBeCloseTo(taxable + Number(u.tax_amount), 2)
    expect(Number(u.tax_amount)).toBeCloseTo(taxable * 0.13, 2)
  })
})
