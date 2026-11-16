import fs from 'fs'
import path from 'path'
import { describe, it, expect } from 'vitest'
import { customerInVarScope } from '@/lib/delegation'

const T = 'tenant-a'
const cust = { tenant_id: T, region: 'Ontario', assigned_rep_id: 'rep-1' }

describe('customerInVarScope (VAR order access)', () => {
  it('entity admin: any customer of own tenant, never another tenant', () => {
    expect(customerInVarScope({ role: 'var_entity_admin', userId: 'u', region: null, tenantId: T }, cust)).toBe(true)
    expect(customerInVarScope({ role: 'var_entity_admin', userId: 'u', region: null, tenantId: 'tenant-b' }, cust)).toBe(false)
  })
  it('regional manager: own region only; no region set → only assigned customers', () => {
    expect(customerInVarScope({ role: 'var_regional_manager', userId: 'rm', region: 'Ontario', tenantId: T }, cust)).toBe(true)
    expect(customerInVarScope({ role: 'var_regional_manager', userId: 'rm', region: 'Quebec', tenantId: T }, cust)).toBe(false)
    expect(customerInVarScope({ role: 'var_regional_manager', userId: 'rm', region: null, tenantId: T }, cust)).toBe(false)
    expect(customerInVarScope({ role: 'var_regional_manager', userId: 'rep-1', region: null, tenantId: T }, cust)).toBe(true)
  })
  it('sales rep: only customers assigned to them', () => {
    expect(customerInVarScope({ role: 'var_sales_rep', userId: 'rep-1', region: 'Ontario', tenantId: T }, cust)).toBe(true)
    expect(customerInVarScope({ role: 'var_sales_rep', userId: 'rep-2', region: 'Ontario', tenantId: T }, cust)).toBe(false)
  })
  it('fails closed: no tenant, no customer, or a non-VAR role', () => {
    expect(customerInVarScope({ role: 'var_entity_admin', userId: 'u', region: null, tenantId: null }, cust)).toBe(false)
    expect(customerInVarScope({ role: 'var_sales_rep', userId: 'rep-1', region: null, tenantId: T }, null)).toBe(false)
    expect(customerInVarScope({ role: 'admin', userId: 'u', region: null, tenantId: T }, cust)).toBe(false)
  })
})

describe('platform-operator RLS migration', () => {
  const sql = fs.readFileSync(path.resolve(__dirname, '../../../supabase/migrations/20261117000000_platform_operator_processes_var_orders.sql'), 'utf8')
  const tables = sql.match(/tables text\[\] := ARRAY\[([\s\S]*?)\]/)![1]

  it('lets BB operators reach the order-processing tables', () => {
    for (const t of ['orders', 'order_items', 'order_timeline', 'shipments', 'imei_records', 'triage_results', 'customers']) {
      expect(tables).toContain(`'${t}'`)
    }
    expect(sql).toMatch(/OR is_platform_operator\(\)[\s\S]*WITH CHECK[\s\S]*OR is_platform_operator\(\)/)
  })
  it('does not widen users/organizations/notifications/audit', () => {
    for (const t of ['users', 'organizations', 'notifications', 'audit_logs']) expect(tables).not.toContain(`'${t}'`)
  })
  it('operator = admin/coe staff of the platform tenant only (not sales, not VAR)', () => {
    expect(sql).toMatch(/role::text IN \('admin', 'coe_manager', 'coe_tech'\)/)
    expect(sql).toMatch(/tenant_id = 'a0000000-0000-4000-a000-0000000000bb'/)
    expect(sql).toMatch(/is_active IS NOT FALSE/)
  })
})
