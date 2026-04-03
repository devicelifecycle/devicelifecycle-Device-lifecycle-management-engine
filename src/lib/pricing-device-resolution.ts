import { createServerSupabaseClient } from '@/lib/supabase/server'

type SupabaseClientLike =
  | Awaited<ReturnType<typeof createServerSupabaseClient>>
  | { from: (table: string) => any }

type DeviceCatalogLookup = {
  id: string
  make: string
  model: string
  category?: string | null
}

type DeviceIdRow = {
  device_id: string | null
}

type DeviceEvidence = {
  competitor: number
  market: number
  baseline: number
  pricing: number
}

const EVIDENCE_WEIGHTS = {
  competitor: 4,
  market: 3,
  baseline: 2,
  pricing: 1,
} as const

function emptyEvidence(): DeviceEvidence {
  return {
    competitor: 0,
    market: 0,
    baseline: 0,
    pricing: 0,
  }
}

function evidenceScore(evidence: DeviceEvidence): number {
  return (
    evidence.competitor * EVIDENCE_WEIGHTS.competitor +
    evidence.market * EVIDENCE_WEIGHTS.market +
    evidence.baseline * EVIDENCE_WEIGHTS.baseline +
    evidence.pricing * EVIDENCE_WEIGHTS.pricing
  )
}

function compareEvidence(
  currentBest: { id: string; evidence: DeviceEvidence },
  candidate: { id: string; evidence: DeviceEvidence },
  preferredDeviceId: string
): number {
  const bestScore = evidenceScore(currentBest.evidence)
  const candidateScore = evidenceScore(candidate.evidence)
  if (candidateScore !== bestScore) return candidateScore - bestScore
  if (candidate.evidence.competitor !== currentBest.evidence.competitor) {
    return candidate.evidence.competitor - currentBest.evidence.competitor
  }
  if (candidate.evidence.market !== currentBest.evidence.market) {
    return candidate.evidence.market - currentBest.evidence.market
  }
  if (candidate.evidence.baseline !== currentBest.evidence.baseline) {
    return candidate.evidence.baseline - currentBest.evidence.baseline
  }
  if (candidate.evidence.pricing !== currentBest.evidence.pricing) {
    return candidate.evidence.pricing - currentBest.evidence.pricing
  }
  if (candidate.id === preferredDeviceId && currentBest.id !== preferredDeviceId) return 1
  if (currentBest.id === preferredDeviceId && candidate.id !== preferredDeviceId) return -1
  return 0
}

function addRowsToEvidence(
  evidenceById: Map<string, DeviceEvidence>,
  rows: DeviceIdRow[] | null,
  key: keyof DeviceEvidence
) {
  for (const row of rows || []) {
    if (!row.device_id) continue
    const evidence = evidenceById.get(row.device_id) || emptyEvidence()
    evidence[key] += 1
    evidenceById.set(row.device_id, evidence)
  }
}

export async function resolveComparablePricingDeviceId(
  supabase: SupabaseClientLike,
  deviceId: string
): Promise<string> {
  try {
    const { data: device } = await supabase
      .from('device_catalog')
      .select('id, make, model, category')
      .eq('id', deviceId)
      .single()

    if (!device) return deviceId

    let siblingQuery = supabase
      .from('device_catalog')
      .select('id')
      .eq('make', (device as DeviceCatalogLookup).make)
      .eq('model', (device as DeviceCatalogLookup).model)
      .eq('is_active', true)

    if ((device as DeviceCatalogLookup).category) {
      siblingQuery = siblingQuery.eq('category', (device as DeviceCatalogLookup).category)
    }

    const { data: siblingRows } = await siblingQuery
    const candidateIds = Array.from(new Set([deviceId, ...(siblingRows || []).map((row: { id: string }) => row.id)]))
    if (candidateIds.length <= 1) return deviceId

    const [competitorRows, marketRows, baselineRows, pricingRows] = await Promise.all([
      supabase
        .from('competitor_prices')
        .select('device_id')
        .in('device_id', candidateIds)
        .not('trade_in_price', 'is', null)
        .gt('trade_in_price', 0),
      supabase
        .from('market_prices')
        .select('device_id')
        .in('device_id', candidateIds)
        .eq('is_active', true),
      supabase
        .from('trained_pricing_baselines')
        .select('device_id')
        .in('device_id', candidateIds)
        .gt('median_trade_price', 0),
      supabase
        .from('pricing_tables')
        .select('device_id')
        .in('device_id', candidateIds)
        .eq('is_active', true),
    ])

    const evidenceById = new Map<string, DeviceEvidence>(candidateIds.map((id) => [id, emptyEvidence()]))
    addRowsToEvidence(evidenceById, (competitorRows.data || []) as DeviceIdRow[], 'competitor')
    addRowsToEvidence(evidenceById, (marketRows.data || []) as DeviceIdRow[], 'market')
    addRowsToEvidence(evidenceById, (baselineRows.data || []) as DeviceIdRow[], 'baseline')
    addRowsToEvidence(evidenceById, (pricingRows.data || []) as DeviceIdRow[], 'pricing')

    let best = {
      id: deviceId,
      evidence: evidenceById.get(deviceId) || emptyEvidence(),
    }

    for (const candidateId of candidateIds) {
      const candidate = {
        id: candidateId,
        evidence: evidenceById.get(candidateId) || emptyEvidence(),
      }
      if (compareEvidence(best, candidate, deviceId) > 0) {
        best = candidate
      }
    }

    return evidenceScore(best.evidence) > 0 ? best.id : deviceId
  } catch {
    return deviceId
  }
}
