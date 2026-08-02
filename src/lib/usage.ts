// ============================================================================
// TENANT USAGE — counts measured against the plan's limits
// ============================================================================
// Turns a tenant's current counts (customers, users, …) into per-metric usage
// with remaining headroom, using the licensing quota helper. Pure.

import { quotaStatus, LIMIT_KEYS, type LicenseLimits, type LimitKey, type QuotaStatus } from './licensing'

export type UsageCounts = Partial<Record<LimitKey, number>>
export type UsageReport = Record<LimitKey, QuotaStatus>

/** Build a per-metric usage report (used / limit / remaining / over) for a tenant. */
export function buildUsageReport(counts: UsageCounts, license: LicenseLimits): UsageReport {
  const out = {} as UsageReport
  for (const k of LIMIT_KEYS) out[k] = quotaStatus(license[k], counts[k] ?? 0)
  return out
}

/** Metrics currently over their limit (for surfacing warnings). */
export function overLimitMetrics(report: UsageReport): LimitKey[] {
  return LIMIT_KEYS.filter((k) => report[k].exceeded)
}
