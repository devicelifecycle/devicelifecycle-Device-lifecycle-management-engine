import { describe, it, expect } from 'vitest'
import { buildVarRollup } from '@/lib/var-rollup'

const reps = [
  { id: 'rep-1', full_name: 'Alex Rep', region: 'ON' },
  { id: 'rep-2', full_name: 'Blair Rep', region: 'ON' },
  { id: 'rep-3', full_name: 'Casey Rep', region: 'BC' },
]

const customers = [
  { id: 'c-1', assigned_rep_id: 'rep-1', region: 'ON' },
  { id: 'c-2', assigned_rep_id: 'rep-1', region: 'ON' },
  { id: 'c-3', assigned_rep_id: 'rep-2', region: 'ON' },
  { id: 'c-4', assigned_rep_id: 'rep-3', region: 'BC' },
  { id: 'c-5', assigned_rep_id: null, region: null },
]

const orders = [
  { customer_id: 'c-1', total_amount: 100 },
  { customer_id: 'c-1', total_amount: 50 },
  { customer_id: 'c-3', total_amount: 200 },
  { customer_id: 'c-4', total_amount: 1000 },
  { customer_id: null, total_amount: 999 }, // orphaned order, must never crash or get attributed
]

describe('buildVarRollup', () => {
  it('rolls up customer + order counts/value per rep', () => {
    const { byRep } = buildVarRollup(reps, customers, orders)
    const rep1 = byRep.find((r) => r.repId === 'rep-1')!
    expect(rep1).toMatchObject({ customerCount: 2, orderCount: 2, orderValue: 150 })
    const rep2 = byRep.find((r) => r.repId === 'rep-2')!
    expect(rep2).toMatchObject({ customerCount: 1, orderCount: 1, orderValue: 200 })
    const rep3 = byRep.find((r) => r.repId === 'rep-3')!
    expect(rep3).toMatchObject({ customerCount: 1, orderCount: 1, orderValue: 1000 })
  })

  it('rolls up by region across all reps in that region', () => {
    const { byRegion } = buildVarRollup(reps, customers, orders)
    const on = byRegion.find((r) => r.region === 'ON')!
    expect(on).toMatchObject({ repCount: 2, customerCount: 3, orderCount: 3, orderValue: 350 })
    const bc = byRegion.find((r) => r.region === 'BC')!
    expect(bc).toMatchObject({ repCount: 1, customerCount: 1, orderCount: 1, orderValue: 1000 })
  })

  it('sorts byRegion and byRep descending by order value', () => {
    const { byRegion, byRep } = buildVarRollup(reps, customers, orders)
    expect(byRegion[0].region).toBe('BC') // 1000 > 350
    expect(byRep[0].repId).toBe('rep-3')  // 1000 is the highest single rep
  })

  it('counts customers with no assigned rep (or a rep not in the roll-up) as unassigned', () => {
    const { unassignedCustomerCount } = buildVarRollup(reps, customers, orders)
    expect(unassignedCustomerCount).toBe(1) // c-5
  })

  it('never attributes an orphaned order (null customer_id) to anyone, and does not crash', () => {
    const { byRep } = buildVarRollup(reps, customers, orders)
    const totalOrderCount = byRep.reduce((s, r) => s + r.orderCount, 0)
    expect(totalOrderCount).toBe(4) // 5 orders minus the 1 orphaned one
  })

  it('handles a rep with zero customers cleanly (no NaN, no crash)', () => {
    const { byRep } = buildVarRollup(reps, [], [])
    expect(byRep.every((r) => r.customerCount === 0 && r.orderCount === 0 && r.orderValue === 0)).toBe(true)
  })

  it('treats a missing total_amount as 0 rather than NaN', () => {
    const { byRep } = buildVarRollup(
      [{ id: 'rep-1', full_name: 'Alex', region: null }],
      [{ id: 'c-1', assigned_rep_id: 'rep-1', region: null }],
      [{ customer_id: 'c-1', total_amount: null }],
    )
    expect(byRep[0].orderValue).toBe(0)
    expect(byRep[0].orderCount).toBe(1)
  })
})
