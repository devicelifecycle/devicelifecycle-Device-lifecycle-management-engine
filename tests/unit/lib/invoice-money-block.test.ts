import { describe, it, expect } from 'vitest'
import { invoiceMoneyBlock } from '@/lib/billing'
import { hasPermission } from '@/lib/permissions'

describe('invoiceMoneyBlock', () => {
  it('refuses a payment on a draft (never billed, can still be rebuilt)', () => {
    expect(invoiceMoneyBlock('draft', 'payment', 0)).toMatch(/Send the invoice/)
    expect(invoiceMoneyBlock('sent', 'payment', 0)).toBeNull()
  })
  it('refuses voiding while money is held; allows once refunded to 0', () => {
    expect(invoiceMoneyBlock('sent', 'void', 469.2)).toMatch(/469\.20 paid/)
    expect(invoiceMoneyBlock('sent', 'void', 0)).toBeNull()
    expect(invoiceMoneyBlock('draft', 'void', 0)).toBeNull()
  })
  it('refunds are left to the cap check in the RPC', () => {
    expect(invoiceMoneyBlock('sent', 'refund', 100)).toBeNull()
  })
})

describe('Option B permission', () => {
  it('only the VAR entity admin (and BB admin) may raise customer invoices', () => {
    expect(hasPermission('var_entity_admin', 'customer_billing.manage')).toBe(true)
    expect(hasPermission('admin', 'customer_billing.manage')).toBe(true)
    for (const r of ['var_regional_manager', 'var_sales_rep', 'coe_manager', 'customer'])
      expect(hasPermission(r, 'customer_billing.manage')).toBe(false)
  })
  it('the VAR entity admin still cannot manage BB→VAR invoices', () => {
    expect(hasPermission('var_entity_admin', 'billing.manage')).toBe(false)
  })
})
