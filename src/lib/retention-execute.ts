// ============================================================================
// DATA RETENTION — EXECUTION
// ============================================================================
// Applies each tenant's retention policy for real. Stage 1 (the dry-run
// report) still exists and still answers the same question; this is what
// actually removes rows, on a live system, so the loop is written to be
// boring and interruptible rather than clever:
//
//   * A tenant with no policy for a class (days === null) is skipped outright.
//     "Keep forever" remains the default, so a tenant nobody has configured is
//     untouched by every run.
//   * Deletes go through retention_delete_batch, which re-checks the table
//     allowlist server-side. This module cannot widen that list.
//   * Batched with a per-class ceiling. A class that still has more to remove
//     when the ceiling is hit simply continues on the next run — no single run
//     can cascade, and the audit row shows it was capped.
//   * Every class of every tenant writes a retention_runs row, including the
//     failures, so "nothing was deleted" and "the delete failed" are never the
//     same-looking outcome.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  RETENTION_TARGETS, resolveRetentionPolicy, retentionCutoff, effectiveDays,
} from '@/lib/retention'

/** Rows removed per class, per run, before the job defers the rest to tomorrow. */
export const PER_CLASS_RUN_CEILING = 20_000
/** Rows per delete statement. Small enough to stay off the lock for long. */
export const BATCH_SIZE = 2_000

export interface RetentionExecutionLine {
  tenantId: string
  tenantName: string
  key: string
  days: number
  cutoff: string
  deleted: number
  /** True when the per-class ceiling stopped the loop with rows still eligible. */
  capped: boolean
  error?: string
}

export interface RetentionExecutionResult {
  dryRun: false
  startedAt: string
  finishedAt: string
  totalDeleted: number
  lines: RetentionExecutionLine[]
}

/**
 * Run retention for every tenant. `triggeredBy` is recorded on each audit row
 * ('cron' or an admin's id) so a manual run is distinguishable from the
 * schedule months later.
 */
export async function executeRetention(
  supabase: SupabaseClient,
  triggeredBy: string,
  now: Date = new Date(),
): Promise<RetentionExecutionResult> {
  const startedAt = now.toISOString()
  const lines: RetentionExecutionLine[] = []

  const { data: tenants, error: tErr } = await supabase
    .from('tenants').select('id, name, settings').order('name')
  if (tErr) throw new Error(`retention: tenants lookup failed: ${tErr.message}`)

  for (const t of tenants ?? []) {
    const policy = resolveRetentionPolicy((t.settings as { retention?: unknown } | null)?.retention)
    for (const target of RETENTION_TARGETS) {
      const days = effectiveDays(policy[target.key], null)
      if (days === null) continue // keep forever — the default, and the safe one

      const cutoff = retentionCutoff(days, now)
      const runStart = new Date().toISOString()
      let deleted = 0
      let capped = false
      let error: string | undefined

      try {
        // Loop until a batch comes back short (nothing left) or we hit the
        // ceiling. Each call is its own transaction, so an interruption
        // mid-run leaves consistent state and the next run resumes.
        for (;;) {
          const remaining = PER_CLASS_RUN_CEILING - deleted
          if (remaining <= 0) { capped = true; break }
          const limit = Math.min(BATCH_SIZE, remaining)
          const { data, error: rpcErr } = await supabase.rpc('retention_delete_batch', {
            p_table: target.table,
            p_ts_column: target.tsColumn,
            p_tenant_id: t.id,
            p_cutoff: cutoff,
            p_limit: limit,
          })
          if (rpcErr) throw new Error(rpcErr.message)
          const n = Number(data ?? 0)
          deleted += n
          if (n < limit) break // fewer than asked for ⇒ nothing eligible remains
        }
      } catch (err) {
        error = err instanceof Error ? err.message : String(err)
        console.error(`retention: ${t.name} / ${target.key} failed`, err)
      }

      lines.push({
        tenantId: t.id, tenantName: t.name as string, key: target.key,
        days, cutoff, deleted, capped, error,
      })

      // Audit every outcome, including zero-row and failed ones.
      const { error: auditErr } = await supabase.from('retention_runs').insert({
        tenant_id: t.id,
        data_class: target.key,
        cutoff,
        days_kept: days,
        rows_deleted: deleted,
        triggered_by: triggeredBy,
        error: error ?? null,
        started_at: runStart,
        finished_at: new Date().toISOString(),
      })
      if (auditErr) console.error('retention: audit insert failed', auditErr)
    }
  }

  return {
    dryRun: false,
    startedAt,
    finishedAt: new Date().toISOString(),
    totalDeleted: lines.reduce((s, l) => s + l.deleted, 0),
    lines,
  }
}
