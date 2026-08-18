import { describe, it, expect } from 'vitest'
import { delegationLevel, customerScopeFilter, canManageCustomer, canManageVarTeamMember, resolveTargetTenant } from '@/lib/delegation'
import { DELEGATED_ROLES } from '@/types'
import { PLATFORM_TENANT_ID } from '@/lib/tenant-resolve'

describe('delegation level', () => {
  it('maps VAR roles to their scope', () => {
    expect(delegationLevel('var_entity_admin')).toBe('tenant')
    expect(delegationLevel('var_regional_manager')).toBe('region')
    expect(delegationLevel('var_sales_rep')).toBe('own')
  })
  it('non-VAR roles get none (existing rules apply)', () => {
    expect(delegationLevel('admin')).toBe('none')
    expect(delegationLevel('sales')).toBe('none')
    expect(delegationLevel(null)).toBe('none')
  })
  it('every DELEGATED_ROLES entry has a real (non-none) scope', () => {
    // Guards against adding a delegated role but forgetting to scope it.
    for (const r of DELEGATED_ROLES) {
      expect(delegationLevel(r)).not.toBe('none')
    }
    expect(DELEGATED_ROLES).toHaveLength(3)
  })
})

describe('customer scope filter', () => {
  const base = { userId: 'u1', region: 'ON' }

  it('entity admin and non-VAR roles get no extra filter', () => {
    expect(customerScopeFilter({ role: 'var_entity_admin', ...base })).toBeNull()
    expect(customerScopeFilter({ role: 'admin', ...base })).toBeNull()
  })
  it('regional manager filters by region', () => {
    expect(customerScopeFilter({ role: 'var_regional_manager', ...base })).toEqual({ column: 'region', value: 'ON' })
  })
  it('regional manager with no region falls back to own (never whole tenant)', () => {
    expect(customerScopeFilter({ role: 'var_regional_manager', userId: 'u1', region: null }))
      .toEqual({ column: 'assigned_rep_id', value: 'u1' })
  })
  it('sales rep filters to their own assigned customers', () => {
    expect(customerScopeFilter({ role: 'var_sales_rep', ...base })).toEqual({ column: 'assigned_rep_id', value: 'u1' })
  })
})

describe('canManageCustomer', () => {
  it('platform admin can manage any customer', () => {
    expect(canManageCustomer('admin', 'admin', null, 'ON')).toBe(true)
  })
  it('VAR entity admin can manage any customer in the tenant', () => {
    expect(canManageCustomer('var_entity_admin', 'var_entity_admin', null, 'BC')).toBe(true)
  })
  it('regional manager can manage only their own region', () => {
    expect(canManageCustomer('var_regional_manager', 'var_regional_manager', 'ON', 'ON')).toBe(true)
    expect(canManageCustomer('var_regional_manager', 'var_regional_manager', 'ON', 'BC')).toBe(false)
    expect(canManageCustomer('var_regional_manager', 'var_regional_manager', null, 'ON')).toBe(false)
  })
  it('sales rep and end customer cannot manage', () => {
    expect(canManageCustomer('var_sales_rep', 'var_sales_rep', 'ON', 'ON')).toBe(false)
    expect(canManageCustomer('customer', 'customer', null, null)).toBe(false)
  })
})

describe('canManageVarTeamMember', () => {
  it('platform admin can create either delegated role, anywhere', () => {
    expect(canManageVarTeamMember('admin', 'admin', null, 'var_regional_manager', 'ON')).toBe(true)
    expect(canManageVarTeamMember('admin', 'admin', null, 'var_sales_rep', 'BC')).toBe(true)
  })

  it('VAR entity admin can create either delegated role anywhere in their tenant (no region restriction)', () => {
    expect(canManageVarTeamMember('var_entity_admin', 'var_entity_admin', null, 'var_regional_manager', 'ON')).toBe(true)
    expect(canManageVarTeamMember('var_entity_admin', 'var_entity_admin', null, 'var_sales_rep', 'BC')).toBe(true)
  })

  it('regional manager can only create a sales rep in their own region', () => {
    expect(canManageVarTeamMember('var_regional_manager', 'var_regional_manager', 'ON', 'var_sales_rep', 'ON')).toBe(true)
  })
  it('regional manager cannot create a sales rep in a different region', () => {
    expect(canManageVarTeamMember('var_regional_manager', 'var_regional_manager', 'ON', 'var_sales_rep', 'BC')).toBe(false)
  })
  it('regional manager cannot create another regional manager', () => {
    expect(canManageVarTeamMember('var_regional_manager', 'var_regional_manager', 'ON', 'var_regional_manager', 'ON')).toBe(false)
  })
  it('regional manager with no region set can never create anyone (never falls back to whole tenant)', () => {
    expect(canManageVarTeamMember('var_regional_manager', 'var_regional_manager', null, 'var_sales_rep', 'ON')).toBe(false)
  })

  it('sales rep and end customer cannot manage any team member', () => {
    expect(canManageVarTeamMember('var_sales_rep', 'var_sales_rep', 'ON', 'var_sales_rep', 'ON')).toBe(false)
    expect(canManageVarTeamMember('customer', 'customer', null, 'var_sales_rep', null)).toBe(false)
  })
})

describe('resolveTargetTenant', () => {
  it('a VAR-role actor is always pinned to their own tenant, ignoring any requested override', () => {
    expect(resolveTargetTenant(false, 'var-1', 'var-2')).toBe('var-1')
    expect(resolveTargetTenant(false, 'var-1', null)).toBe('var-1')
  })
  it('a VAR-role actor with no real tenant (platform tenant or null) resolves to null', () => {
    expect(resolveTargetTenant(false, PLATFORM_TENANT_ID, null)).toBeNull()
    expect(resolveTargetTenant(false, null, 'var-2')).toBeNull()
  })
  it('a platform admin must explicitly request a tenant — never defaults to their own', () => {
    expect(resolveTargetTenant(true, PLATFORM_TENANT_ID, 'var-2')).toBe('var-2')
    expect(resolveTargetTenant(true, PLATFORM_TENANT_ID, null)).toBeNull()
  })
})
