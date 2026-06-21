// ============================================================================
// SLA TRAINING SERVICE
// ============================================================================
// Mirrors PricingTrainingService (src/services/pricing-training.service.ts):
// periodically recompute a recency-weighted, outlier-trimmed baseline —
// here, "how long orders of this type usually spend in this stage" — and
// persist it, instead of the live heuristic recomputing a plain average on
// every request. Same STAGE_DEFINITIONS as sla-prediction.service.ts.

import { createServiceRoleClient } from '@/lib/supabase/service-role'
import type { OrderType } from '@/types'

const STAGE_DEFINITIONS = [
  { status: 'submitted', enterCol: 'submitted_at', exitCol: 'quoted_at' },
  { status: 'quoted', enterCol: 'quoted_at', exitCol: 'accepted_at' },
  { status: 'accepted', enterCol: 'accepted_at', exitCol: 'received_at' },
  { status: 'received', enterCol: 'received_at', exitCol: 'completed_at' },
] as const

const MIN_SAMPLE_SIZE = 3
const MIN_BASELINE_HOURS = 0.5

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = (p / 100) * (sorted.length - 1)
  const lo = Math.floor(idx)
  const hi = Math.ceil(idx)
  return lo === hi ? sorted[lo] : sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo])
}

function weightedAverage(entries: Array<{ value: number; weight: number }>): number {
  const totalWeight = entries.reduce((s, e) => s + e.weight, 0)
  if (totalWeight <= 0) return 0
  return entries.reduce((s, e) => s + e.value * e.weight, 0) / totalWeight
}

// Recently-completed stage durations are more representative of current
// team pace/process than ones from months ago — same decay curve as pricing.
function recencyWeight(ageDays: number): number {
  if (ageDays <= 7) return 1.0
  if (ageDays <= 30) return 0.95
  if (ageDays <= 60) return 0.85
  if (ageDays <= 90) return 0.7
  if (ageDays <= 180) return 0.5
  return 0.3
}

function trimOutliers(hours: number[]): number[] {
  if (hours.length < 5) return hours
  const q1 = percentile(hours, 25)
  const q3 = percentile(hours, 75)
  const iqr = q3 - q1
  if (iqr <= 0) return hours
  const lower = q1 - 1.5 * iqr
  const upper = q3 + 1.5 * iqr
  const filtered = hours.filter((h) => h >= lower && h <= upper)
  return filtered.length >= 3 ? filtered : hours
}

export interface SlaTrainingResult {
  baselines_upserted: number
  sample_counts: Record<string, number>
  errors: string[]
}

export class SlaTrainingService {
  static async train(): Promise<SlaTrainingResult> {
    const service = createServiceRoleClient()
    const errors: string[] = []
    const sampleCounts: Record<string, number> = {}
    const now = Date.now()
    const nowIso = new Date().toISOString()
    let baselinesUpserted = 0

    for (const stage of STAGE_DEFINITIONS) {
      try {
        const { data: rows, error } = await service
          .from('orders')
          .select(`type, ${stage.enterCol}, ${stage.exitCol}`)
          .not(stage.enterCol, 'is', null)
          .not(stage.exitCol, 'is', null)

        if (error) throw new Error(error.message)

        const byType = new Map<OrderType, Array<{ hours: number; weight: number }>>()
        for (const row of (rows || []) as any[]) {
          const enterAt = row[stage.enterCol]
          const exitAt = row[stage.exitCol]
          const hours = (new Date(exitAt).getTime() - new Date(enterAt).getTime()) / (1000 * 60 * 60)
          if (hours < 0) continue
          const ageDays = (now - new Date(exitAt).getTime()) / (1000 * 60 * 60 * 24)
          const list = byType.get(row.type) || []
          list.push({ hours, weight: recencyWeight(ageDays) })
          byType.set(row.type, list)
        }

        for (const [orderType, entries] of byType.entries()) {
          sampleCounts[`${stage.status}:${orderType}`] = entries.length
          if (entries.length < MIN_SAMPLE_SIZE) continue

          const trimmedHours = trimOutliers(entries.map((e) => e.hours))
          const trimmedEntries = entries.filter((e) => trimmedHours.includes(e.hours))
          const weightedAvgHours = Math.round(weightedAverage(trimmedEntries.map((e) => ({ value: e.hours, weight: e.weight }))) * 100) / 100
          // Some historical orders have stage timestamps written ~seconds
          // apart (seed/import scripts simulating a "completed" order
          // without real elapsed time). When most samples for a stage are
          // like that, IQR-trimming correctly treats the rare genuine
          // sample as a statistical outlier and discards it too, landing
          // near 0h — abstain rather than persist a number this unreliable.
          // getEarlyWarnings() falls back to the live unweighted average
          // for any (status, order_type) left uncovered here.
          if (weightedAvgHours < MIN_BASELINE_HOURS) continue

          const { error: upsertError } = await service.from('trained_sla_baselines').upsert(
            {
              status: stage.status,
              order_type: orderType,
              weighted_avg_hours: weightedAvgHours,
              p25_hours: Math.round(percentile(trimmedHours, 25) * 100) / 100,
              p75_hours: Math.round(percentile(trimmedHours, 75) * 100) / 100,
              sample_count: entries.length,
              last_trained_at: nowIso,
              updated_at: nowIso,
            },
            { onConflict: 'status,order_type' }
          )
          if (!upsertError) baselinesUpserted++
          else errors.push(`upsert ${stage.status}/${orderType}: ${upsertError.message}`)
        }
      } catch (e) {
        errors.push(`stage ${stage.status}: ${e instanceof Error ? e.message : 'Unknown'}`)
      }
    }

    return { baselines_upserted: baselinesUpserted, sample_counts: sampleCounts, errors }
  }
}
