// ============================================================================
// OPERATIONS METRICS -- BB Admin usage/license/security rollups
// ============================================================================
// Pure helpers behind /api/admin/reports/operations. Every number here comes
// from real rows (orders, notifications, users, customers, tenants); metrics
// Storage and API/AI usage are metered since 2026-09-19 (usage-metering.ts);
// a source that fails yields null, shown as "unavailable", never a fake zero.

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
  /** Bytes in the uploads bucket, measured from storage.objects. null = measurement unavailable (not zero). */
  storageBytes: number | null
  /** API calls month-to-date. null = rollup unavailable (not zero). */
  apiCallsMtd: number | null
  /** AI tokens month-to-date. null = rollup unavailable (not zero). */
  aiTokensMtd: number | null
}

export interface UsageByTenant {
  storage: Map<string, { bytes: number }> | null
  month: Map<string, { api_calls: number; ai_tokens: number }> | null
}

/**
 * Per-active-VAR license table rows, ordered by name for stable display.
 * A null map (the source failed) yields null cells so the UI can say
 * "unavailable" instead of printing a zero that looks like a measurement.
 */
export function buildLicenseTable(
  tenants: Array<{ id: string; name?: string | null; settings?: unknown }>,
  customersByTenant: Record<string, number>,
  usage: UsageByTenant = { storage: null, month: null },
): LicenseRow[] {
  return tenants
    .map((t) => ({
      tenantId: t.id,
      tenantName: t.name || 'Untitled VAR',
      tier: licenseTierLabel(t.settings),
      customers: customersByTenant[t.id] ?? 0,
      storageBytes: usage.storage ? (usage.storage.get(t.id)?.bytes ?? 0) : null,
      apiCallsMtd: usage.month ? (usage.month.get(t.id)?.api_calls ?? 0) : null,
      aiTokensMtd: usage.month ? (usage.month.get(t.id)?.ai_tokens ?? 0) : null,
    }))
    .sort((a, b) => a.tenantName.localeCompare(b.tenantName))
}

/** Platform-wide storage total; null when the measurement is unavailable. */
export function totalStorageBytes(rows: LicenseRow[]): number | null {
  if (rows.some((r) => r.storageBytes === null)) return null
  return rows.reduce((s, r) => s + (r.storageBytes ?? 0), 0)
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = bytes / 1024
  let i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`
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
