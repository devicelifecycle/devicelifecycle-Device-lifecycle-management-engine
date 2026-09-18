// ============================================================================
// DATA RETENTION — policy model + dry-run planning (pure, no I/O)
// ============================================================================
//
// The outline lists "retention policies" under BB Admin Security. Nothing in
// the codebase ever aged data out, so this is built in two deliberate stages:
//
//   1. (this) A per-tenant policy — days to keep, per data class — and a
//      DRY-RUN report that counts exactly what a run WOULD remove. Nothing is
//      deleted anywhere. An operator can set a policy, watch the numbers for a
//      few weeks, and adjust before a single row is at risk.
//   2. (later, separate decision) A scheduled job that executes the plan.
//
// Data classes are limited to operational exhaust that has a clear "older
// than N days is safe to drop" reading. Business records — orders, customers,
// invoices, triage results — are NOT retention targets; deleting them is a
// product decision with legal weight, not housekeeping.
//
// Every target's timestamp column was verified against the live database
// (2026-09-18) — audit_logs uses `timestamp`, not `created_at`, and selecting
// a column that does not exist returns an error the caller could mistake for
// "zero rows". The structural test pins the list.

export const RETENTION_TARGETS = [
  {
    key: 'audit_logs',
    table: 'audit_logs',
    tsColumn: 'timestamp',
    label: 'Audit log entries',
    description: 'Who changed what. Long retention is normal for compliance.',
  },
  {
    key: 'notifications',
    table: 'notifications',
    tsColumn: 'created_at',
    label: 'In-app notifications',
    description: 'Bell-icon notifications already delivered to users.',
  },
  {
    key: 'notification_attempts',
    table: 'notification_attempts',
    tsColumn: 'created_at',
    label: 'Email / SMS delivery attempts',
    description: 'Per-send delivery log (provider response, retries).',
  },
  {
    key: 'order_timeline',
    table: 'order_timeline',
    tsColumn: 'created_at',
    label: 'Order timeline events',
    description: 'Status-change history shown on each order. Removing it does not affect the order itself.',
  },
  {
    key: 'sla_breaches',
    table: 'sla_breaches',
    tsColumn: 'created_at',
    label: 'SLA breach records',
    description: 'Historical breach markers used by reporting.',
  },
  {
    key: 'impersonation_log',
    table: 'impersonation_log',
    tsColumn: 'ended_at',
    label: 'Impersonation sessions (ended)',
    description: 'Only sessions that have ended are ever candidates; an open session has no ended_at and is never counted.',
  },
] as const

export type RetentionKey = (typeof RETENTION_TARGETS)[number]['key']
export const RETENTION_KEYS: RetentionKey[] = RETENTION_TARGETS.map((t) => t.key)

/** A policy value: days to keep, or null = keep forever (the default). */
export type RetentionPolicy = Record<RetentionKey, number | null>

/** Floor so a typo ("3" instead of "365") cannot plan the removal of last week's audit trail. */
export const RETENTION_MIN_DAYS = 30
export const RETENTION_MAX_DAYS = 3650

/**
 * Read a tenant's `settings.retention` into a complete, validated policy.
 * Unknown keys are ignored; out-of-range or non-integer values fall back to
 * null (keep forever) rather than being clamped — a silently clamped value is
 * a policy the operator never set.
 */
export function resolveRetentionPolicy(raw: unknown): RetentionPolicy {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const out = {} as RetentionPolicy
  for (const key of RETENTION_KEYS) {
    const v = src[key]
    out[key] =
      typeof v === 'number' && Number.isInteger(v) && v >= RETENTION_MIN_DAYS && v <= RETENTION_MAX_DAYS
        ? v
        : null
  }
  return out
}

/** ISO cutoff: rows with timestamp strictly before this are "older than `days`". */
export function retentionCutoff(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString()
}

export interface RetentionPlanLine {
  tenant_id: string
  tenant_name: string
  key: RetentionKey
  label: string
  /** Days applied for this line — the tenant's policy, or the report-wide override. */
  days: number | null
  /** ISO cutoff, or null when no policy applies (nothing would be removed). */
  cutoff: string | null
  /** Rows that a run at `cutoff` WOULD remove. null when no policy applies. */
  would_remove: number | null
}

/**
 * Decide the effective days for one line. An explicit override (the
 * "what if every tenant kept N days" slider on the report) wins; otherwise the
 * tenant's own policy; otherwise nothing.
 */
export function effectiveDays(policyDays: number | null, overrideDays: number | null): number | null {
  if (overrideDays !== null) return overrideDays
  return policyDays
}
