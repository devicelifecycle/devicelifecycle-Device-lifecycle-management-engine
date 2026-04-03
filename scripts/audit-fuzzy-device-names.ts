#!/usr/bin/env npx tsx

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'

config({ path: '.env.local', override: true })
config({ path: '.env', override: true })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

type DeviceRow = {
  id: string
  make: string | null
  model: string | null
  category: string | null
  variant: string | null
  sku: string | null
  is_active: boolean | null
  created_at: string | null
}

type CandidateRow = DeviceRow & {
  evidence_score: number
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function punctuationFold(value: string): string {
  return normalizeWhitespace(
    value
      .toLowerCase()
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/[\u2033]/g, '"')
      .replace(/\+/g, ' plus ')
      .replace(/[^a-z0-9]+/g, ' ')
  )
}

function fuzzyModelFold(model: string): string {
  return normalizeWhitespace(
    punctuationFold(model)
      .replace(/\bapple watch\b/g, '')
      .replace(/\b(\d+)\s*inch\b/g, '$1')
      .replace(/\b(\d+)\s*"\b/g, '$1')
      .replace(/\biphone se\s*\((\d+)(?:st|nd|rd|th)\s+gen(?:eration)?\)/g, 'iphone se $1')
      .replace(/\bipad\s*\((\d+)(?:st|nd|rd|th)\s+generation\)/g, 'ipad $1')
      .replace(/\bseries\s+/g, 'series ')
  )
}

function auditKey(row: DeviceRow): string {
  return [
    punctuationFold(row.make || ''),
    fuzzyModelFold(row.model || ''),
    punctuationFold(row.category || ''),
    punctuationFold(row.variant || ''),
  ].join('||')
}

function exactComparable(row: DeviceRow): string {
  return [
    punctuationFold(row.make || ''),
    punctuationFold(row.model || ''),
    punctuationFold(row.category || ''),
    punctuationFold(row.variant || ''),
  ].join('||')
}

async function fetchAllActiveDevices(): Promise<DeviceRow[]> {
  const rows: DeviceRow[] = []
  const pageSize = 1000

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('device_catalog')
      .select('id, make, model, category, variant, sku, is_active, created_at')
      .eq('is_active', true)
      .order('make')
      .range(from, from + pageSize - 1)

    if (error) throw new Error(`Failed to fetch device catalog: ${error.message}`)
    rows.push(...((data || []) as DeviceRow[]))
    if (!data || data.length < pageSize) break
  }

  return rows
}

async function countEvidence(deviceIds: string[]): Promise<Map<string, number>> {
  const score = new Map<string, number>(deviceIds.map((id) => [id, 0]))
  const add = (rows: Array<{ device_id: string | null }> | null, weight: number) => {
    for (const row of rows || []) {
      if (!row.device_id) continue
      score.set(row.device_id, (score.get(row.device_id) || 0) + weight)
    }
  }

  for (let i = 0; i < deviceIds.length; i += 200) {
    const chunk = deviceIds.slice(i, i + 200)
    const [competitors, market, baselines, pricing, items, imei] = await Promise.all([
      supabase.from('competitor_prices').select('device_id').in('device_id', chunk),
      supabase.from('market_prices').select('device_id').in('device_id', chunk),
      supabase.from('trained_pricing_baselines').select('device_id').in('device_id', chunk),
      supabase.from('pricing_tables').select('device_id').in('device_id', chunk),
      supabase.from('order_items').select('device_id').in('device_id', chunk),
      supabase.from('imei_records').select('device_id').in('device_id', chunk),
    ])

    add((competitors.data || []) as Array<{ device_id: string | null }>, 4)
    add((market.data || []) as Array<{ device_id: string | null }>, 3)
    add((baselines.data || []) as Array<{ device_id: string | null }>, 2)
    add((pricing.data || []) as Array<{ device_id: string | null }>, 2)
    add((items.data || []) as Array<{ device_id: string | null }>, 3)
    add((imei.data || []) as Array<{ device_id: string | null }>, 3)
  }

  return score
}

function chooseCanonical(rows: CandidateRow[]): CandidateRow {
  return [...rows].sort((a, b) => {
    const skuDiff = Number(Boolean(b.sku)) - Number(Boolean(a.sku))
    if (skuDiff !== 0) return skuDiff

    const evidenceDiff = b.evidence_score - a.evidence_score
    if (evidenceDiff !== 0) return evidenceDiff

    return (a.created_at || '').localeCompare(b.created_at || '')
  })[0]
}

function confidenceLabel(rows: DeviceRow[]): 'high' | 'medium' {
  const exactKeys = new Set(rows.map(exactComparable))
  return exactKeys.size < rows.length ? 'high' : 'medium'
}

async function main() {
  const devices = await fetchAllActiveDevices()
  const groups = new Map<string, DeviceRow[]>()

  for (const device of devices) {
    const key = auditKey(device)
    const bucket = groups.get(key) || []
    bucket.push(device)
    groups.set(key, bucket)
  }

  const candidates = [...groups.entries()]
    .filter(([, rows]) => rows.length > 1)
    .filter(([, rows]) => new Set(rows.map((row) => `${row.make}||${row.model}||${row.category}||${row.variant}`)).size > 1)

  if (candidates.length === 0) {
    console.log(JSON.stringify({ active_devices: devices.length, fuzzy_duplicate_groups: 0, review_list: [] }, null, 2))
    return
  }

  const evidence = await countEvidence(candidates.flatMap(([, rows]) => rows.map((row) => row.id)))

  const reviewList = candidates
    .map(([key, rows]) => {
      const enriched = rows.map((row) => ({
        ...row,
        evidence_score: evidence.get(row.id) || 0,
      }))
      const canonical = chooseCanonical(enriched)

      return {
        normalized_key: key,
        confidence: confidenceLabel(rows),
        canonical: {
          id: canonical.id,
          make: canonical.make,
          model: canonical.model,
          category: canonical.category,
          variant: canonical.variant,
          sku: canonical.sku,
          evidence_score: canonical.evidence_score,
        },
        candidates: enriched.map((row) => ({
          id: row.id,
          make: row.make,
          model: row.model,
          category: row.category,
          variant: row.variant,
          sku: row.sku,
          evidence_score: row.evidence_score,
        })),
      }
    })
    .sort((a, b) => a.normalized_key.localeCompare(b.normalized_key))

  console.log(JSON.stringify({
    active_devices: devices.length,
    fuzzy_duplicate_groups: reviewList.length,
    high_confidence_groups: reviewList.filter((group) => group.confidence === 'high').length,
    medium_confidence_groups: reviewList.filter((group) => group.confidence === 'medium').length,
    review_list: reviewList,
  }, null, 2))
}

main().catch((error) => {
  console.error('Fuzzy audit failed:', error)
  process.exit(1)
})
