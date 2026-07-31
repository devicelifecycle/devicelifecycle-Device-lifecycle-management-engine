import { describe, it, expect } from 'vitest'
import { hasPermission, permissionsForRole, PERMISSION_KEYS } from '@/lib/permissions'

describe('RBAC permissions (mirrors current 6 roles)', () => {
  it('admin has every permission', () => {
    for (const k of PERMISSION_KEYS) expect(hasPermission('admin', k)).toBe(true)
    expect(permissionsForRole('admin').length).toBe(PERMISSION_KEYS.length)
  })

  it('coe_tech can transition orders but cannot manage pricing', () => {
    expect(hasPermission('coe_tech', 'order.transition')).toBe(true)
    expect(hasPermission('coe_tech', 'pricing.manage')).toBe(false)
    expect(hasPermission('coe_tech', 'customer.delete')).toBe(false)
  })

  it('sales can create orders + customers but not delete customers', () => {
    expect(hasPermission('sales', 'order.create')).toBe(true)
    expect(hasPermission('sales', 'customer.create')).toBe(true)
    expect(hasPermission('sales', 'customer.delete')).toBe(false)
    expect(hasPermission('sales', 'commission.manage')).toBe(false)
  })

  it('customer + vendor are read-limited', () => {
    expect(hasPermission('customer', 'order.create')).toBe(true)
    expect(hasPermission('customer', 'customer.view')).toBe(false)
    expect(hasPermission('vendor', 'order.view')).toBe(true)
    expect(hasPermission('vendor', 'order.create')).toBe(false)
  })

  it('only admin can manage commission / platform / tenants', () => {
    for (const role of ['coe_manager', 'coe_tech', 'sales', 'customer', 'vendor']) {
      expect(hasPermission(role, 'commission.manage')).toBe(false)
      expect(hasPermission(role, 'platform.manage')).toBe(false)
      expect(hasPermission(role, 'tenant.manage')).toBe(false)
    }
    expect(hasPermission('admin', 'commission.manage')).toBe(true)
  })

  it('unknown / empty role grants nothing', () => {
    expect(hasPermission(null, 'order.view')).toBe(false)
    expect(hasPermission('nobody', 'order.view')).toBe(false)
    expect(permissionsForRole(undefined)).toEqual([])
  })

  it('delegated VAR roles never exceed BB privileges', () => {
    for (const role of ['var_entity_admin', 'var_regional_manager', 'var_sales_rep']) {
      expect(hasPermission(role, 'platform.manage')).toBe(false)
      expect(hasPermission(role, 'tenant.manage')).toBe(false)
      expect(hasPermission(role, 'commission.manage')).toBe(false) // BB commission stays BB-only
      expect(hasPermission(role, 'pricing.manage')).toBe(false)
    }
  })

  it('VAR entity/regional can set their own margins; rep cannot', () => {
    expect(hasPermission('var_entity_admin', 'commission.var_margins')).toBe(true)
    expect(hasPermission('var_regional_manager', 'commission.var_margins')).toBe(true)
    expect(hasPermission('var_sales_rep', 'commission.var_margins')).toBe(false)
    expect(hasPermission('var_sales_rep', 'order.create')).toBe(true)
  })
})
