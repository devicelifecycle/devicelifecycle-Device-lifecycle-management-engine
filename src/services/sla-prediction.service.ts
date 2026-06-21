// ============================================================================
// SLA EARLY-WARNING (HEURISTIC + TRAINED BASELINES)
// ============================================================================
// Complements the fixed-threshold sla_rules system (warning_hours/breach_hours)
// with a data-driven signal: "this order is pacing slower than orders of this
// type usually do at this stage" — flagged even before it crosses the fixed
// threshold. Prefers the weekly-retrained, recency-weighted baseline in
// trained_sla_baselines (src/services/sla-training.service.ts, mirrors
// trained_pricing_baselines) for speed and recency-awareness; falls back to
// computing a live unweighted average for any (status, order_type) the
// trained table doesn't cover yet (cold start before the first cron run).
// ============================================================================

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { Order, OrderType } from '@/types'

// Each entry: the status being measured, and the [enter, exit] timestamp
// columns that bound how long an order spent in it. Limited to stages with
// a reliable timestamp pair on `orders` — mirrors SLAService.getStatusEnteredAt.
const STAGE_DEFINITIONS = [
  { status: 'submitted', enterCol: 'submitted_at', exitCol: 'quoted_at' },
  { status: 'quoted', enterCol: 'quoted_at', exitCol: 'accepted_at' },
  { status: 'accepted', enterCol: 'accepted_at', exitCol: 'received_at' },
  { status: 'received', enterCol: 'received_at', exitCol: 'completed_at' },
] as const

const MIN_SAMPLE_SIZE = 3 // don't trust an average from fewer than this many historical orders
const PACE_MULTIPLIER = 1.5 // flag when current pace exceeds 1.5x the historical average
// Some historical orders have multiple stage timestamps set in the same
// batch write (seed scripts, bulk imports) rather than reflecting real
// elapsed time, producing a ~0h average. Dividing by that gives an
// Infinity pace ratio, which JSON-serializes to null and shows up as a
// broken "null"x badge — floor the baseline so a real (if small) elapsed
// time is required before anything is flagged against it.
const MIN_BASELINE_HOURS = 0.5

export interface SlaBaseline {
  status: string
  order_type: OrderType
  sample_size: number
  avg_hours: number
}

export interface SlaEarlyWarning {
  order_id: string
  order_number: string
  status: string
  order_type: OrderType
  hours_in_status: number
  baseline_avg_hours: number
  pace_ratio: number // hours_in_status / baseline_avg_hours
}

function hoursBetween(a: string, b: string): number {
  return (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60)
}

export async function computeHistoricalBaselines(): Promise<SlaBaseline[]> {
  const service = createServiceRoleClient()
  const baselines: SlaBaseline[] = []

  for (const stage of STAGE_DEFINITIONS) {
    const { data: rows } = await service
      .from('orders')
      .select(`type, ${stage.enterCol}, ${stage.exitCol}`)
      .not(stage.enterCol, 'is', null)
      .not(stage.exitCol, 'is', null)

    const byType = new Map<OrderType, number[]>()
    for (const row of (rows || []) as any[]) {
      const enterAt = row[stage.enterCol]
      const exitAt = row[stage.exitCol]
      const hours = hoursBetween(enterAt, exitAt)
      if (hours < 0) continue // bad/out-of-order data — skip rather than poison the average
      const list = byType.get(row.type) || []
      list.push(hours)
      byType.set(row.type, list)
    }

    for (const [orderType, hoursList] of byType.entries()) {
      if (hoursList.length < MIN_SAMPLE_SIZE) continue
      const avgHours = Math.round((hoursList.reduce((s, h) => s + h, 0) / hoursList.length) * 10) / 10
      if (avgHours < MIN_BASELINE_HOURS) continue
      baselines.push({
        status: stage.status,
        order_type: orderType,
        sample_size: hoursList.length,
        avg_hours: avgHours,
      })
    }
  }

  return baselines
}

/**
 * Trained baselines (recency-weighted, refreshed weekly) take priority;
 * any (status, order_type) the trained table doesn't cover yet — e.g.
 * before the first cron run, or too few historical samples for that
 * combination — falls back to a live unweighted average.
 */
async function getBaselines(): Promise<{ baselines: SlaBaseline[]; source: 'trained' | 'live' | 'mixed' }> {
  const service = createServiceRoleClient()
  const { data: trainedRows } = await service
    .from('trained_sla_baselines')
    .select('status, order_type, weighted_avg_hours, sample_count')

  const trained: SlaBaseline[] = (trainedRows || []).map((r: any) => ({
    status: r.status,
    order_type: r.order_type,
    sample_size: r.sample_count,
    avg_hours: r.weighted_avg_hours,
  }))

  const liveCandidates = await computeHistoricalBaselines()
  const trainedKeys = new Set(trained.map((b) => `${b.status}|${b.order_type}`))
  const liveOnly = liveCandidates.filter((b) => !trainedKeys.has(`${b.status}|${b.order_type}`))

  const baselines = [...trained, ...liveOnly]
  const source = liveOnly.length === 0 ? 'trained' : trained.length === 0 ? 'live' : 'mixed'
  return { baselines, source }
}

export async function getEarlyWarnings(): Promise<{ baselines: SlaBaseline[]; baseline_source: string; warnings: SlaEarlyWarning[] }> {
  const { baselines, source } = await getBaselines()
  if (baselines.length === 0) return { baselines, baseline_source: source, warnings: [] }

  const baselineByKey = new Map(baselines.map((b) => [`${b.status}|${b.order_type}`, b]))
  const trackedStatuses = STAGE_DEFINITIONS.map((s) => s.status)

  const service = createServiceRoleClient()
  const { data: openOrders } = await service
    .from('orders')
    .select('id, order_number, type, status, is_sla_breached, submitted_at, quoted_at, accepted_at, received_at, updated_at, created_at')
    .in('status', trackedStatuses)
    .eq('is_sla_breached', false) // already-breached orders get the existing (louder) signal — don't double up

  const enterColByStatus: Record<string, keyof Order> = {
    submitted: 'submitted_at',
    quoted: 'quoted_at',
    accepted: 'accepted_at',
    received: 'received_at',
  }

  const warnings: SlaEarlyWarning[] = []
  for (const order of (openOrders || []) as any[]) {
    const baseline = baselineByKey.get(`${order.status}|${order.type}`)
    if (!baseline) continue

    const enterCol = enterColByStatus[order.status]
    const enteredAt = order[enterCol]
    if (!enteredAt) continue

    const hoursInStatus = hoursBetween(enteredAt, new Date().toISOString())
    const paceRatio = hoursInStatus / baseline.avg_hours
    if (paceRatio < PACE_MULTIPLIER) continue

    warnings.push({
      order_id: order.id,
      order_number: order.order_number,
      status: order.status,
      order_type: order.type,
      hours_in_status: Math.round(hoursInStatus * 10) / 10,
      baseline_avg_hours: baseline.avg_hours,
      pace_ratio: Math.round(paceRatio * 10) / 10,
    })
  }

  warnings.sort((a, b) => b.pace_ratio - a.pace_ratio)
  return { baselines, baseline_source: source, warnings }
}
