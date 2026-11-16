import { beforeEach, describe, expect, it, vi } from 'vitest'
import { canViewTenant } from '@/lib/delegation'

const requireAuthMock = vi.fn()
vi.mock('@/lib/supabase/require-auth', () => ({ requireAuth: requireAuthMock }))

describe('canViewTenant', () => {
  it('lets platform roles read any tenant', () => {
    expect(canViewTenant('admin', 'platform', 'tenant-b')).toBe(true)
    expect(canViewTenant('coe_manager', 'platform', 'tenant-b')).toBe(true)
  })
  it('limits every VAR role to its own tenant', () => {
    for (const role of ['var_entity_admin', 'var_regional_manager', 'var_sales_rep']) {
      expect(canViewTenant(role, 'tenant-a', 'tenant-a')).toBe(true)
      expect(canViewTenant(role, 'tenant-a', 'tenant-b')).toBe(false)
      expect(canViewTenant(role, null, 'tenant-b')).toBe(false)
    }
  })
})

describe('requirePlatformPermission', () => {
  beforeEach(() => requireAuthMock.mockReset())

  it('rejects VAR roles even when they hold the permission key', async () => {
    const { requirePlatformPermission } = await import('@/lib/supabase/require-permission')
    // var_regional_manager and var_sales_rep both hold reports.view
    for (const role of ['var_regional_manager', 'var_sales_rep']) {
      requireAuthMock.mockResolvedValue({ effectiveRole: role, tenantId: 'tenant-a', profile: {} })
      const g = await requirePlatformPermission('reports.view')
      expect('error' in g && g.error.status).toBe(403)
    }
    requireAuthMock.mockResolvedValue({ effectiveRole: 'var_entity_admin', tenantId: 'tenant-a', profile: {} })
    const billing = await requirePlatformPermission('billing.view')
    expect('error' in billing && billing.error.status).toBe(403)
  })

  it('still admits platform roles', async () => {
    const { requirePlatformPermission } = await import('@/lib/supabase/require-permission')
    requireAuthMock.mockResolvedValue({ effectiveRole: 'coe_manager', tenantId: 'platform', profile: {} })
    expect('auth' in (await requirePlatformPermission('reports.view'))).toBe(true)
    requireAuthMock.mockResolvedValue({ effectiveRole: 'admin', tenantId: 'platform', profile: {} })
    expect('auth' in (await requirePlatformPermission('billing.view'))).toBe(true)
  })
})
