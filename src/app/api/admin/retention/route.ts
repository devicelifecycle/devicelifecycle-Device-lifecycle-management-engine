// ============================================================================
// ADMIN — DATA RETENTION DRY RUN
// ============================================================================
// GET /api/admin/retention[?days=N]
//
// For every tenant and every retention data class, counts the rows a
// retention run WOULD remove under the tenant's own policy (settings.retention)
// — or, with ?days=N, under a hypothetical "everyone keeps N days" policy so
// an operator can size a policy before setting it.
//
// This endpoint deletes nothing and there is no endpoint that does. The
// response says so (`dry_run: true`) so a future client can't mistake it for
// an execution report.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import {
  RETENTION_TARGETS, RETENTION_MIN_DAYS, RETENTION_MAX_DAYS,
  resolveRetentionPolicy, retentionCutoff, effectiveDays, type RetentionPlanLine,
} from '@/lib/retention'
import { executeRetention } from '@/lib/retention-execute'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  if (auth.effectiveRole !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Optional what-if override. Absent → each tenant's own policy.
  const rawDays = req.nextUrl.searchParams.get('days')
  let overrideDays: number | null = null
  if (rawDays !== null && rawDays !== '') {
    const n = Number.parseInt(rawDays, 10)
    if (!Number.isInteger(n) || n < RETENTION_MIN_DAYS || n > RETENTION_MAX_DAYS) {
      return NextResponse.json(
        { error: `days must be an integer between ${RETENTION_MIN_DAYS} and ${RETENTION_MAX_DAYS}` },
        { status: 400 },
      )
    }
    overrideDays = n
  }

  const supabase = createServiceRoleClient()
  const { data: tenants, error: tErr } = await supabase
    .from('tenants').select('id, name, settings').order('name')
  if (tErr) {
    console.error('retention: tenants lookup failed', tErr)
    return NextResponse.json({ error: 'Failed to load tenants' }, { status: 500 })
  }

  const now = new Date()
  const lines: RetentionPlanLine[] = []
  const failures: string[] = []

  for (const t of tenants ?? []) {
    const policy = resolveRetentionPolicy((t.settings as { retention?: unknown } | null)?.retention)
    for (const target of RETENTION_TARGETS) {
      const days = effectiveDays(policy[target.key], overrideDays)
      const base: RetentionPlanLine = {
        tenant_id: t.id, tenant_name: t.name, key: target.key, label: target.label,
        days, cutoff: null, would_remove: null,
      }
      if (days === null) { lines.push(base); continue }

      const cutoff = retentionCutoff(days, now)
      // head:true + count:'exact' → a COUNT(*) with no row transfer.
      const { count, error } = await supabase
        .from(target.table)
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', t.id)
        .lt(target.tsColumn, cutoff)
      if (error) {
        // Surface, don't swallow: a count that failed must not read as "0 rows".
        failures.push(`${t.name} / ${target.key}: ${error.message}`)
        lines.push({ ...base, cutoff, would_remove: null })
        continue
      }
      lines.push({ ...base, cutoff, would_remove: count ?? 0 })
    }
  }

  const { data: history } = await supabase
    .from('retention_runs')
    .select('id, tenant_id, data_class, cutoff, days_kept, rows_deleted, triggered_by, error, started_at')
    .order('started_at', { ascending: false })
    .limit(50)

  return NextResponse.json({
    dry_run: true,
    generated_at: now.toISOString(),
    history: history ?? [],
    override_days: overrideDays,
    targets: RETENTION_TARGETS.map((t) => ({ key: t.key, label: t.label, description: t.description })),
    lines,
    failures,
  })
}

/**
 * POST /api/admin/retention — run retention NOW, for real.
 *
 * The body must carry { confirm: 'DELETE' }. A run removes rows permanently,
 * so a mis-click, a double-submit or a replayed request must not be enough to
 * trigger one. GET remains the safe way to see what this would do.
 *
 * Tenants with no policy are skipped entirely — "keep forever" is the default,
 * so this is inert until an operator sets a number on a VAR's page.
 */
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  if (auth.effectiveRole !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = (await req.json().catch(() => null)) as { confirm?: unknown } | null
  if (body?.confirm !== 'DELETE') {
    return NextResponse.json(
      { error: 'This permanently deletes data. Send { "confirm": "DELETE" } to proceed.' },
      { status: 400 },
    )
  }

  try {
    const result = await executeRetention(createServiceRoleClient(), auth.profile.id)
    return NextResponse.json(result)
  } catch (err) {
    console.error('retention: manual run failed', err)
    return NextResponse.json({ error: 'Retention run failed' }, { status: 500 })
  }
}
