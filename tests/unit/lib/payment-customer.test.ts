import { describe, it, expect, vi, beforeEach } from 'vitest'

const createCustomer = vi.fn()
vi.mock('@/lib/payment-provider', () => ({ getProvider: () => ({ createCustomer }) }))

function fakeDb({ settings = {}, pmCustomer = null as string | null }) {
  const updates: unknown[] = []
  const db = {
    updates,
    from(table: string) {
      const c: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'not', 'limit']) c[m] = () => c
      if (table === 'tenants') {
        c.single = async () => ({ data: { name: 'Sai', settings } })
        c.update = (u: unknown) => { updates.push(u); return { eq: async () => ({ error: null }) } }
      } else {
        c.maybeSingle = async () => ({ data: pmCustomer ? { provider_customer_id: pmCustomer } : null })
      }
      return c
    },
  }
  return db
}

describe('resolveProviderCustomer', () => {
  beforeEach(() => { createCustomer.mockReset(); createCustomer.mockResolvedValue({ providerCustomerId: 'cus_new' }) })

  it('first card: creates the customer once and persists it (setup no longer needs a saved card)', async () => {
    const { resolveProviderCustomer } = await import('@/lib/payment-customer')
    const db = fakeDb({ settings: { billingMode: 'external' } })
    expect(await resolveProviderCustomer(db as never, 't1', 'a@x.test')).toBe('cus_new')
    expect(createCustomer).toHaveBeenCalledWith({ tenantId: 't1', name: 'Sai', email: 'a@x.test' })
    expect(db.updates[0]).toEqual({ settings: { billingMode: 'external', billing: { providerCustomerId: 'cus_new' } } })
  })

  it('reuses the persisted customer — setup and attach share one', async () => {
    const { resolveProviderCustomer } = await import('@/lib/payment-customer')
    const db = fakeDb({ settings: { billing: { providerCustomerId: 'cus_saved' } } })
    expect(await resolveProviderCustomer(db as never, 't1', '')).toBe('cus_saved')
    expect(createCustomer).not.toHaveBeenCalled()
    expect(db.updates).toHaveLength(0)
  })

  it('adopts the customer from an existing saved card instead of creating a duplicate', async () => {
    const { resolveProviderCustomer } = await import('@/lib/payment-customer')
    const db = fakeDb({ pmCustomer: 'cus_old' })
    expect(await resolveProviderCustomer(db as never, 't1', '')).toBe('cus_old')
    expect(createCustomer).not.toHaveBeenCalled()
  })
})
