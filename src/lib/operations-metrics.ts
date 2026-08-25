// ============================================================================
// OPERATIONS METRICS -- BB Admin usage/license/security rollups
// ============================================================================
// Pure helpers behind /api/admin/reports/operations. Every number here comes
// from real rows (orders, notifications, users, customers, tenants); metrics
// with no data source today (storage, API-call metering) are deliberately
// absent and surfaced as "Not yet metered" in the UI instead of fake zeros.

import { resolveLicense, UNLIMITED } from './licensing'

/** First-of-month boundaries (UTC) for this-month vs last-month comparisons. */
export function monthBounds(now: Date): { thisMonthStart: string; lastMonthStart: string } {
  const thisStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const lastStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  return { thisMonthStart: thisStart.toISOString(), lastMonthStart: lastStart.toISOString() }
}

function allUnlimited(l: Record<string, number>): boolean {
  return Object.values(l).every((v) => v === UNLIMITED)
}

function limitLabel(v: number, noun: string): string {
  return v === UNLIMITED ? `${noun}: unlimited` : `${noun}: ${v}`
}

/** A compact one-line description of a tenant's license blob. */
export function licenseTierLabel(settings: unknown): string {
  const s = (settings && typeof settings === 'object' ? settings : {}) as { license?: unknown }
  if (!s.license || typeof s.license !== 'object') return 'Unlimited (default)'
  const l = resolveLicense(s.license)
  if (allUnlimited(l)) return 'Unlimited (default)'
  return [limitLabel(l.customers, 'customers'), limitLabel(l.users, 'users')].join(' · ')
}

export interface LicenseRow {
  tenantId: string
  tenantName: string
  /** Compact human label of the VAR's assigned license tier. */
  tier: string
  /** Live customer count on the tenant. */
  customers: number
}

/** Per-active-VAR license table rows, ordered by name for stable display. */
export function buildLicenseTable(
  tenants: Array<{ id: string; name?: string | null; settings?: unknown }>,
  customersByTenant: Record<string, number>,
): LicenseRow[] {
  return tenants
    .map((t) => ({
      tenantId: t.id,
      tenantName: t.name || 'Untitled VAR',
      tier: licenseTierLabel(t.settings),
      customers: customersByTenant[t.id] ?? 0,
    }))
    .sort((a, b) => a.tenantName.localeCompare(b.tenantName))
}

export interface NotificationBreakdown {
  channel: 'email' | 'sms'
  status: 'sent' | 'failed'
  count: number
}

export interface ActiveCounts { total: number; active: number; inactive: number }

/** Split a total and an active count into an active/inactive view. */
export function splitCounts(total: number, active: number): ActiveCounts {
  return { total, active, inactive: Math.max(0, total - active) }
}

export interface OperationsSummary {
  ordersThisMonth: number
  ordersLastMonth: number
  /** Percent change month-over-month; null when last month had zero orders. */
  ordersDeltaPct: number | null
  customersTotal: number
  activeVars: number
  notifications: NotificationBreakdown[]
  users: ActiveCounts
  customersSplit: ActiveCounts
  licenses: LicenseRow[]
}

/** Assemble the operations summary from pre-fetched counts/rows. */
export function buildOperationsSummary(input: Omit<OperationsSummary, 'ordersDeltaPct'>): OperationsSummary {
  const ordersDeltaPct = input.ordersLastMonth > 0
    ? Math.round(((input.ordersThisMonth - input.ordersLastMonth) / input.ordersLastMonth) * 100)
    : null
  return { ...input, ordersDeltaPct }
}
