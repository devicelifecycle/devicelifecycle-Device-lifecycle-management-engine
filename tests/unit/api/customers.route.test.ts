import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const createCustomerMock = vi.fn()
const updateCustomerMock = vi.fn()
const assertEmailAvailableMock = vi.fn()
const provisionUserMock = vi.fn()
const createServerSupabaseClientMock = vi.fn()

vi.mock('@/services/customer.service', () => ({
  CustomerService: {
    createCustomer: createCustomerMock,
    updateCustomer: updateCustomerMock,
  },
}))

vi.mock('@/services/user-provisioning.service', () => ({
  UserProvisioningService: {
    assertEmailAvailable: assertEmailAvailableMock,
    provisionUser: provisionUserMock,
  },
}))

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: createServerSupabaseClientMock,
}))

function makeBuilder(table: string, existingCustomerId?: string) {
  const filters: Record<string, unknown> = {}

  const builder: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockImplementation((field: string, value: unknown) => {
      filters[field] = value
      return builder
    }),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockImplementation(async () => {
      if (table === 'customers') {
        return {
          data: existingCustomerId ? [{ id: existingCustomerId }] : [],
          error: null,
        }
      }

      return { data: [], error: null }
    }),
    single: vi.fn().mockImplementation(async () => {
      if (table === 'users') {
        return {
          data: { role: 'admin', organization_id: null },
          error: null,
        }
      }

      if (table === 'organizations') {
        return {
          data: { id: filters.id, type: 'customer' },
          error: null,
        }
      }

      return { data: null, error: null }
    }),
  }

  return builder
}

function makeSupabase(existingCustomerId?: string) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-1' } } }),
    },
    from: vi.fn().mockImplementation((table: string) => makeBuilder(table, existingCustomerId)),
  }
}

describe('POST /api/customers', () => {
  const orgId = '11111111-2222-3333-4444-555555555555'

  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()

    createCustomerMock.mockResolvedValue({
      id: 'customer-new',
      company_name: 'Acme',
    })
    updateCustomerMock.mockResolvedValue({
      id: 'customer-existing',
      company_name: 'Acme',
    })
    provisionUserMock.mockResolvedValue({
      created: false,
      skippedReason: 'customer portal already exists',
      emailSentTo: 'buyer@example.com',
      emailSent: false,
    })
  })

  it('reuses an existing active customer profile for the organization', async () => {
    createServerSupabaseClientMock.mockReturnValue(makeSupabase('customer-existing'))

    const { POST } = await import('@/app/api/customers/route')
    const response = await POST(
      new NextRequest('http://localhost:3000/api/customers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          organization_id: orgId,
          company_name: 'Acme',
          contact_name: 'Buyer',
          contact_email: 'buyer@example.com',
          contact_phone: '+15555550123',
        }),
      }),
    )

    const json = await response.json()
    expect(response.status).toBe(200)
    expect(updateCustomerMock).toHaveBeenCalledWith(
      'customer-existing',
      expect.objectContaining({
        company_name: 'Acme',
        contact_name: 'Buyer',
        contact_email: 'buyer@example.com',
      }),
    )
    expect(createCustomerMock).not.toHaveBeenCalled()
    expect(json.customer_profile_reused).toBe(true)
  })

  it('creates a fresh customer profile when the organization has none', async () => {
    createServerSupabaseClientMock.mockReturnValue(makeSupabase())

    const { POST } = await import('@/app/api/customers/route')
    const response = await POST(
      new NextRequest('http://localhost:3000/api/customers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          organization_id: orgId,
          company_name: 'Acme',
          contact_name: 'Buyer',
          contact_email: 'buyer@example.com',
          contact_phone: '+15555550123',
        }),
      }),
    )

    const json = await response.json()
    expect(response.status).toBe(201)
    expect(createCustomerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        company_name: 'Acme',
        contact_name: 'Buyer',
        contact_email: 'buyer@example.com',
      }),
      orgId,
    )
    expect(updateCustomerMock).not.toHaveBeenCalled()
    expect(json.customer_profile_reused).toBe(false)
  })
})
