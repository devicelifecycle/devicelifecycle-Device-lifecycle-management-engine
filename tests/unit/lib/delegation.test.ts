import { describe, it, expect } from 'vitest'
import { delegationLevel, customerScopeFilter } from '@/lib/delegation'

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
