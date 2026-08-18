import { describe, it, expect } from 'vitest'
import { canAccessOrderFile } from '@/lib/order-file-access'
import { PLATFORM_TENANT_ID } from '@/lib/tenant-resolve'

const TENANT_A = 'aaaaaaaa-0000-4000-a000-00000000000a'
const TENANT_B = 'bbbbbbbb-0000-4000-a000-00000000000b'
const ORG_1 = 'org-1'
const ORG_2 = 'org-2'

const order = (tenant: string | null, org: string | null) => ({
  tenant_id: tenant,
  customers: org ? { organization_id: org } : null,
})

describe('canAccessOrderFile — tenant + org isolation (IDOR guard)', () => {
  it('lets the owning customer download their own org+tenant order', () => {
    expect(canAccessOrderFile(order(TENANT_A, ORG_1), { organization_id: ORG_1, role: 'customer' }, 'customer', TENANT_A)).toBe(true)
  })

  it('blocks a customer from another org in the same tenant', () => {
    expect(canAccessOrderFile(order(TENANT_A, ORG_2), { organization_id: ORG_1, role: 'customer' }, 'customer', TENANT_A)).toBe(false)
  })

  it('blocks tenant-scoped staff from reaching another tenant (the IDOR)', () => {
    // sales in tenant A must not read an order that belongs to tenant B
    expect(canAccessOrderFile(order(TENANT_B, ORG_2), { organization_id: null, role: 'sales' }, 'sales', TENANT_A)).toBe(false)
  })

  it('allows tenant-scoped staff within their own tenant', () => {
    expect(canAccessOrderFile(order(TENANT_A, ORG_2), { organization_id: null, role: 'sales' }, 'sales', TENANT_A)).toBe(true)
  })

  it('blocks an org-bound COE tech from another org', () => {
    expect(canAccessOrderFile(order(TENANT_A, ORG_2), { organization_id: ORG_1, role: 'coe_tech' }, 'coe_tech', TENANT_A)).toBe(false)
  })

  it('allows a platform COE tech (no org) within the tenant', () => {
    expect(canAccessOrderFile(order(TENANT_A, ORG_2), { organization_id: null, role: 'coe_tech' }, 'coe_tech', TENANT_A)).toBe(true)
  })

  it('lets a platform admin (platform tenant) read any tenant order', () => {
    expect(canAccessOrderFile(order(TENANT_B, ORG_2), { organization_id: null, role: 'admin' }, 'admin', PLATFORM_TENANT_ID)).toBe(true)
    expect(canAccessOrderFile(order(TENANT_B, ORG_2), { organization_id: null, role: 'admin' }, 'admin', null)).toBe(true)
  })

  it('treats an order with no tenant_id as platform-tenant', () => {
    // legacy row (null tenant) is only reachable by platform actors, not tenant-scoped ones
    expect(canAccessOrderFile(order(null, ORG_1), { organization_id: null, role: 'sales' }, 'sales', TENANT_A)).toBe(false)
    expect(canAccessOrderFile(order(null, ORG_1), { organization_id: null, role: 'admin' }, 'admin', PLATFORM_TENANT_ID)).toBe(true)
  })
})
