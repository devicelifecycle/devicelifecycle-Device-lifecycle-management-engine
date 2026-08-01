// ============================================================================
// PLATFORM METRICS — BB Admin global reporting
// ============================================================================
// Pure rollups for the platform dashboard: MRR/ARR from active VARs' assigned
// plans, recognized revenue from paid invoices, and active/inactive splits.

const round2 = (n: number) => Math.round(n * 100) / 100

export interface ActiveSplit { total: number; active: number; inactive: number }

/** Split a set of records into active / inactive by an is_active flag. */
export function activeSplit(items: Array<{ is_active?: boolean | null }>): ActiveSplit {
  let active = 0
  for (const it of items) if (it.is_active !== false) active++
  return { total: items.length, active, inactive: items.length - active }
}

/** MRR = sum of active tenants' assigned plan monthly price. */
export function computeMrr(
  tenants: Array<{ is_active?: boolean | null; plan?: string | null }>,
  planPriceBySlug: Record<string, number>,
): number {
  return round2(
    tenants.reduce((sum, t) => {
      if (t.is_active === false || !t.plan) return sum
      return sum + Math.max(0, planPriceBySlug[t.plan] ?? 0)
    }, 0),
  )
}

/** Sum invoice totals filtered to the given statuses (e.g. recognized revenue = paid). */
export function sumInvoiceTotals(
  invoices: Array<{ status?: string | null; total?: number | null }>,
  statuses: string[],
): number {
  const set = new Set(statuses)
  return round2(invoices.reduce((sum, inv) => (inv.status && set.has(inv.status) ? sum + (inv.total ?? 0) : sum), 0))
}

export interface PlatformSummary {
  mrr: number
  arr: number
  revenuePaid: number
  revenueOutstanding: number
  tenants: ActiveSplit & { vars: number }
  customers: ActiveSplit
  orders: number
  devices: number
}

/** Assemble the full platform summary from fetched inputs. Customers come in as
 *  a precomputed split (COUNT queries) since that table can be very large. */
export function buildPlatformSummary(input: {
  tenants: Array<{ is_active?: boolean | null; plan?: string | null; type?: string | null }>
  planPriceBySlug: Record<string, number>
  invoices: Array<{ status?: string | null; total?: number | null }>
  customers: ActiveSplit
  orderCount: number
  deviceCount: number
}): PlatformSummary {
  const mrr = computeMrr(input.tenants, input.planPriceBySlug)
  const tenantSplit = activeSplit(input.tenants)
  return {
    mrr,
    arr: round2(mrr * 12),
    revenuePaid: sumInvoiceTotals(input.invoices, ['paid']),
    revenueOutstanding: sumInvoiceTotals(input.invoices, ['sent']),
    tenants: { ...tenantSplit, vars: input.tenants.filter((t) => t.type === 'var').length },
    customers: input.customers,
    orders: input.orderCount,
    devices: input.deviceCount,
  }
}
