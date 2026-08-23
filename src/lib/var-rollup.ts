// ============================================================================
// VAR ROLL-UP REPORTING — aggregate customers/orders by rep and by region
// ============================================================================
// Pure aggregation over already-fetched rows (no I/O here — the route does the
// bounded fetch, this just does the math), so it's trivially unit testable.
// Matches the outline's "VAR Reporting: roll-up of all reps under their
// umbrella, ability to view by rep or regionally."

export interface RollupRep {
  id: string
  full_name: string
  region: string | null
}

export interface RollupCustomer {
  id: string
  assigned_rep_id: string | null
  region: string | null
}

export interface RollupOrder {
  customer_id: string | null
  total_amount: number | null
}

export interface RepRollup {
  repId: string
  repName: string
  region: string | null
  customerCount: number
  orderCount: number
  orderValue: number
}

export interface RegionRollup {
  region: string
  repCount: number
  customerCount: number
  orderCount: number
  orderValue: number
}

export interface VarRollup {
  byRep: RepRollup[]
  byRegion: RegionRollup[]
  /** Customers with no assigned rep — not attributable to anyone's roll-up, worth surfacing separately. */
  unassignedCustomerCount: number
}

export function buildVarRollup(reps: RollupRep[], customers: RollupCustomer[], orders: RollupOrder[]): VarRollup {
  const orderStatsByCustomer = new Map<string, { count: number; value: number }>()
  for (const o of orders) {
    if (!o.customer_id) continue
    const entry = orderStatsByCustomer.get(o.customer_id) ?? { count: 0, value: 0 }
    entry.count += 1
    entry.value += o.total_amount ?? 0
    orderStatsByCustomer.set(o.customer_id, entry)
  }

  const byRep: RepRollup[] = reps.map((rep) => {
    const own = customers.filter((c) => c.assigned_rep_id === rep.id)
    let orderCount = 0
    let orderValue = 0
    for (const c of own) {
      const stats = orderStatsByCustomer.get(c.id)
      if (stats) { orderCount += stats.count; orderValue += stats.value }
    }
    return { repId: rep.id, repName: rep.full_name, region: rep.region, customerCount: own.length, orderCount, orderValue }
  })

  const regionNames = [...new Set(reps.map((r) => r.region).filter((r): r is string => !!r))]
  const byRegion: RegionRollup[] = regionNames.map((region) => {
    const repsInRegion = byRep.filter((r) => r.region === region)
    return {
      region,
      repCount: repsInRegion.length,
      customerCount: repsInRegion.reduce((s, r) => s + r.customerCount, 0),
      orderCount: repsInRegion.reduce((s, r) => s + r.orderCount, 0),
      orderValue: repsInRegion.reduce((s, r) => s + r.orderValue, 0),
    }
  }).sort((a, b) => b.orderValue - a.orderValue)

  const assignedRepIds = new Set(reps.map((r) => r.id))
  const unassignedCustomerCount = customers.filter((c) => !c.assigned_rep_id || !assignedRepIds.has(c.assigned_rep_id)).length

  return { byRep: byRep.sort((a, b) => b.orderValue - a.orderValue), byRegion, unassignedCustomerCount }
}
