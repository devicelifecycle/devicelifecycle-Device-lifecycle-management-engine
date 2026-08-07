import { describe, it, expect } from 'vitest'
import { delegationLevel, customerScopeFilter, canManageCustomer } from '@/lib/delegation'
import { DELEGATED_ROLES } from '@/types'

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
