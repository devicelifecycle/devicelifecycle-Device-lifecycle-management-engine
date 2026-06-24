#!/usr/bin/env npx tsx
// ============================================================================
// Generalized device_catalog deduplication.
//
// Why this exists instead of another one-off migration: three separate
// migrations this session (20260624000006, 20260624000009, plus the manual
// alias list in cleanup-fuzzy-device-aliases.ts) each hand-fixed one
// duplicate cluster (iPhone XR, SE 2nd gen, 16e, Galaxy "Plus" vs "+"...).
// Direct DB queries showed the same fragmentation affects Samsung/Google
// devices too (Pixel 7a: 4 rows, zero pricing on any; Galaxy A54: 4 rows;
// Galaxy S22 family: 60 price rows split across 3 rows for Ultra/+/base).
// This script finds and merges ALL such clusters in one pass, and is meant
// to be re-run periodically (it's idempotent) rather than chasing each new
// cluster by hand.
//
// Unlike scripts/cleanup-duplicate-devices.ts (which groups by EXACT
// make+model+category+variant string match and therefore can never find
// these clusters at all — "iPhone SE 2nd" vs "iPhone SE (2nd generation)"
// are different exact strings), this groups by the same aggressive fuzzy
// normalization device-match.ts already uses to stop NEW duplicates at
// CSV-upload time (stripForFuzzyCompare + normalizeAppleModel), now run
// retroactively across the whole catalog.
//
// It also does NOT trust device_catalog.make for grouping. Live data proved
// it can be wrong: rows exist with make="Samsung", model="Google Pixel 7a
// 128GB" — an upload mistake that left a real Google device mistagged as
// Samsung. Brand identity is instead resolved from the model text itself
// (which reliably contains the real brand word), falling back to the make
// column only when the model text has no recognizable brand prefix. Any
// disagreement is reported (and the canonical row's make field corrected)
// so it surfaces instead of silently staying wrong.
//
// Disposal is soft: losers get is_active=false + merged_into_device_id set
// to the canonical row (migration 20260624000010). Never hard-deleted —
// scripts/cleanup-duplicate-devices.ts hard-deletes once orphaned, which
// this intentionally does NOT replicate, since deleted rows can't carry the
// merged_into_device_id pointer that makes the merge traceable/reversible.
//
// Usage:
//   npx tsx scripts/dedupe-device-catalog.ts            # dry run (default)
//   npx tsx scripts/dedupe-device-catalog.ts --apply     # write changes
// ============================================================================

import { config } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { computeDeviceIdentity, resolveMakeColumn, type DeviceIdentity } from '../src/lib/device-match'
import { DEVICE_BRANDS } from '../src/lib/constants'

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

const applyChanges = process.argv.includes('--apply')

type DeviceRow = {
  id: string
  make: string | null
  model: string | null
  category: string | null
  sku: string | null
  is_active: boolean | null
  created_at: string | null
}

type GenericRow = Record<string, unknown> & { id?: string; device_id?: string | null }

const STRAIGHT_MOVE_TABLES = ['order_items', 'imei_records', 'sales_history', 'pricing_training_data'] as const

const UNIQUE_MERGE_TABLES = [
  'competitor_prices',
  'market_prices',
  'pricing_tables',
  'trained_pricing_baselines',
  'international_prices',
] as const

const BRAND_DISPLAY: Record<string, string> = Object.fromEntries(
  DEVICE_BRANDS.map((b) => [b.toLowerCase(), b])
)

function timestampValue(value: unknown): number {
  if (!value || typeof value !== 'string') return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function preferCandidate(a: DeviceRow, b: DeviceRow, evidence: Map<string, number>): DeviceRow {
  const aSku = a.sku ? 1 : 0
  const bSku = b.sku ? 1 : 0
  if (aSku !== bSku) return aSku > bSku ? a : b

  const aActive = a.is_active ? 1 : 0
  const bActive = b.is_active ? 1 : 0
  if (aActive !== bActive) return aActive > bActive ? a : b

  const aEvidence = evidence.get(a.id) || 0
  const bEvidence = evidence.get(b.id) || 0
  if (aEvidence !== bEvidence) return aEvidence > bEvidence ? a : b

  return timestampValue(a.created_at) <= timestampValue(b.created_at) ? a : b
}

async function fetchAll<T>(table: string, select: string): Promise<T[]> {
  const rows: T[] = []
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + pageSize - 1)
    if (error) throw new Error(`Failed to fetch ${table}: ${error.message}`)
    rows.push(...((data || []) as T[]))
    if (!data || data.length < pageSize) break
  }
  return rows
}

async function countEvidence(deviceIds: string[]): Promise<Map<string, number>> {
  const evidence = new Map<string, number>(deviceIds.map((id) => [id, 0]))
  const addWeight = (rows: Array<{ device_id: string | null }> | null, weight: number) => {
    for (const row of rows || []) {
      if (!row.device_id) continue
      evidence.set(row.device_id, (evidence.get(row.device_id) || 0) + weight)
    }
  }

  const chunks: string[][] = []
  for (let i = 0; i < deviceIds.length; i += 200) chunks.push(deviceIds.slice(i, i + 200))

  for (const chunk of chunks) {
    const [competitors, market, pricing, baselines, manual, orderItems, imei, history, intl, training] =
      await Promise.all([
        supabase.from('competitor_prices').select('device_id').in('device_id', chunk),
        supabase.from('market_prices').select('device_id').in('device_id', chunk),
        supabase.from('pricing_tables').select('device_id').in('device_id', chunk),
        supabase.from('trained_pricing_baselines').select('device_id').in('device_id', chunk),
        supabase.from('device_last_manual_prices').select('device_id').in('device_id', chunk),
        supabase.from('order_items').select('device_id').in('device_id', chunk),
        supabase.from('imei_records').select('device_id').in('device_id', chunk),
        supabase.from('sales_history').select('device_id').in('device_id', chunk),
        supabase.from('international_prices').select('device_id').in('device_id', chunk),
        supabase.from('pricing_training_data').select('device_id').in('device_id', chunk),
      ])

    addWeight((competitors.data || []) as Array<{ device_id: string | null }>, 4)
    addWeight((market.data || []) as Array<{ device_id: string | null }>, 3)
    addWeight((pricing.data || []) as Array<{ device_id: string | null }>, 2)
    addWeight((baselines.data || []) as Array<{ device_id: string | null }>, 2)
    addWeight((manual.data || []) as Array<{ device_id: string | null }>, 2)
    addWeight((orderItems.data || []) as Array<{ device_id: string | null }>, 3)
    addWeight((imei.data || []) as Array<{ device_id: string | null }>, 3)
    addWeight((history.data || []) as Array<{ device_id: string | null }>, 2)
    addWeight((intl.data || []) as Array<{ device_id: string | null }>, 2)
    addWeight((training.data || []) as Array<{ device_id: string | null }>, 1)
  }

  return evidence
}

function mergeRow(table: string, current: GenericRow, incoming: GenericRow): GenericRow {
  const currentUpdated = Math.max(
    timestampValue(current.updated_at),
    timestampValue(current.scraped_at),
    timestampValue(current.last_trained_at),
    timestampValue(current.last_set_at),
    timestampValue(current.created_at)
  )
  const incomingUpdated = Math.max(
    timestampValue(incoming.updated_at),
    timestampValue(incoming.scraped_at),
    timestampValue(incoming.last_trained_at),
    timestampValue(incoming.last_set_at),
    timestampValue(incoming.created_at)
  )

  if (table === 'trained_pricing_baselines') {
    const currentSamples = Number(current.sample_count || 0)
    const incomingSamples = Number(incoming.sample_count || 0)
    if (incomingSamples > currentSamples || (incomingSamples === currentSamples && incomingUpdated > currentUpdated)) {
      return { ...current, ...incoming, id: current.id, device_id: current.device_id }
    }
    return current
  }

  if (incomingUpdated > currentUpdated) {
    return { ...current, ...incoming, id: current.id, device_id: current.device_id }
  }

  const merged: GenericRow = { ...current }
  for (const [key, value] of Object.entries(incoming)) {
    if (key === 'id' || key === 'device_id') continue
    if (merged[key] == null && value != null) merged[key] = value
  }
  return merged
}

function uniqueKeyFor(table: string, row: GenericRow): string {
  switch (table) {
    case 'competitor_prices':
      return [row.storage || '', row.competitor_name || '', row.condition || ''].join('||')
    case 'market_prices':
      return [row.storage || '', row.carrier || '', row.effective_date || ''].join('||')
    case 'pricing_tables':
      return [row.condition || '', row.effective_date || ''].join('||')
    case 'trained_pricing_baselines':
      return [row.storage || '', row.carrier || '', row.condition || ''].join('||')
    case 'international_prices':
      return [row.storage || '', row.condition || '', row.region || '', row.country_code || '', row.effective_date || ''].join('||')
    default:
      throw new Error(`Unsupported unique merge table: ${table}`)
  }
}

async function moveStraightRefs(table: (typeof STRAIGHT_MOVE_TABLES)[number], fromId: string, toId: string): Promise<number> {
  const { data, error } = await supabase.from(table).select('id').eq('device_id', fromId)
  if (error) throw new Error(`Failed to read ${table}: ${error.message}`)
  const rows = (data || []) as Array<{ id: string }>
  if (!rows.length) return 0

  const { error: updateError } = await supabase.from(table).update({ device_id: toId }).eq('device_id', fromId)
  if (updateError) throw new Error(`Failed to update ${table}: ${updateError.message}`)
  return rows.length
}

async function moveUniqueRows(table: (typeof UNIQUE_MERGE_TABLES)[number], fromId: string, toId: string): Promise<number> {
  const { data: fromRows, error: fromError } = await supabase.from(table).select('*').eq('device_id', fromId)
  if (fromError) throw new Error(`Failed to read ${table} source rows: ${fromError.message}`)
  const sourceRows = (fromRows || []) as GenericRow[]
  if (!sourceRows.length) return 0

  const { data: toRows, error: toError } = await supabase.from(table).select('*').eq('device_id', toId)
  if (toError) throw new Error(`Failed to read ${table} target rows: ${toError.message}`)
  const targetRows = (toRows || []) as GenericRow[]
  const targetByKey = new Map(targetRows.map((row) => [uniqueKeyFor(table, row), row]))

  let moved = 0
  for (const row of sourceRows) {
    const key = uniqueKeyFor(table, row)
    const existing = targetByKey.get(key)

    if (!existing) {
      const { error: updateError } = await supabase.from(table).update({ device_id: toId }).eq('id', row.id)
      if (updateError) throw new Error(`Failed to move ${table} row ${row.id}: ${updateError.message}`)
      moved += 1
      continue
    }

    const merged = mergeRow(table, existing, row)
    const updatePayload = { ...merged }
    delete updatePayload.id
    delete updatePayload.device_id

    const { error: mergeError } = await supabase.from(table).update(updatePayload).eq('id', existing.id as string)
    if (mergeError) throw new Error(`Failed to merge ${table} row ${row.id}: ${mergeError.message}`)

    const { error: deleteError } = await supabase.from(table).delete().eq('id', row.id as string)
    if (deleteError) throw new Error(`Failed to delete duplicate ${table} row ${row.id}: ${deleteError.message}`)
    moved += 1
  }

  return moved
}

/** device_last_manual_prices has a composite PK (device_id, storage, condition) — no `id` column, so it can't reuse moveUniqueRows. */
async function moveManualPrices(fromId: string, toId: string): Promise<number> {
  const { data: fromRows, error: fromError } = await supabase
    .from('device_last_manual_prices')
    .select('*')
    .eq('device_id', fromId)
  if (fromError) throw new Error(`Failed to read device_last_manual_prices source rows: ${fromError.message}`)
  const sourceRows = (fromRows || []) as GenericRow[]
  if (!sourceRows.length) return 0

  const { data: toRows, error: toError } = await supabase
    .from('device_last_manual_prices')
    .select('*')
    .eq('device_id', toId)
  if (toError) throw new Error(`Failed to read device_last_manual_prices target rows: ${toError.message}`)
  const targetRows = (toRows || []) as GenericRow[]
  const targetByKey = new Map(targetRows.map((row) => [[row.storage || '', row.condition || ''].join('||'), row]))

  let moved = 0
  for (const row of sourceRows) {
    const key = [row.storage || '', row.condition || ''].join('||')
    const existing = targetByKey.get(key)

    if (!existing) {
      const { error: insertError } = await supabase
        .from('device_last_manual_prices')
        .insert({ ...row, device_id: toId })
      if (insertError) throw new Error(`Failed to move device_last_manual_prices row: ${insertError.message}`)
      const { error: deleteError } = await supabase
        .from('device_last_manual_prices')
        .delete()
        .eq('device_id', fromId)
        .eq('storage', row.storage as string)
        .eq('condition', row.condition as string)
      if (deleteError) throw new Error(`Failed to remove moved device_last_manual_prices row: ${deleteError.message}`)
      moved += 1
      continue
    }

    const merged = mergeRow('device_last_manual_prices', existing, row)
    const updatePayload = { ...merged }
    delete updatePayload.device_id
    delete updatePayload.storage
    delete updatePayload.condition

    const { error: mergeError } = await supabase
      .from('device_last_manual_prices')
      .update(updatePayload)
      .eq('device_id', toId)
      .eq('storage', existing.storage as string)
      .eq('condition', existing.condition as string)
    if (mergeError) throw new Error(`Failed to merge device_last_manual_prices row: ${mergeError.message}`)

    const { error: deleteError } = await supabase
      .from('device_last_manual_prices')
      .delete()
      .eq('device_id', fromId)
      .eq('storage', row.storage as string)
      .eq('condition', row.condition as string)
    if (deleteError) throw new Error(`Failed to delete duplicate device_last_manual_prices row: ${deleteError.message}`)
    moved += 1
  }

  return moved
}

async function main() {
  const devices = await fetchAll<DeviceRow>(
    'device_catalog',
    'id, make, model, category, sku, is_active, created_at'
  ).then((rows) => rows.filter((r) => r.is_active))

  const groups = new Map<string, DeviceRow[]>()
  const identities = new Map<string, DeviceIdentity>()
  for (const device of devices) {
    const identity = computeDeviceIdentity(device.make, device.model, device.category)
    identities.set(device.id, identity)
    const list = groups.get(identity.key) || []
    list.push(device)
    groups.set(identity.key, list)
  }

  const duplicateGroups = [...groups.entries()].filter(([, rows]) => rows.length > 1)
  const allDuplicateIds = duplicateGroups.flatMap(([, rows]) => rows.map((row) => row.id))
  const evidence = await countEvidence(allDuplicateIds)

  console.log(`Active catalog rows scanned: ${devices.length}`)
  console.log(`Duplicate clusters found: ${duplicateGroups.length}`)
  console.log(`Duplicate rows to merge: ${duplicateGroups.reduce((sum, [, rows]) => sum + rows.length - 1, 0)}`)
  console.log(applyChanges ? 'Mode: APPLY' : 'Mode: DRY RUN')

  const clusterReports = duplicateGroups.map(([key, rows]) => {
    const canonical = rows.reduce((best, row) => preferCandidate(best, row, evidence))
    const makeMismatches = rows
      .filter((row) => resolveMakeColumn(row.make) !== identities.get(row.id)!.brand)
      .map((row) => ({ id: row.id, storedMake: row.make, resolvedBrand: identities.get(row.id)!.brand }))

    return {
      key,
      canonical: { id: canonical.id, make: canonical.make, model: canonical.model, category: canonical.category },
      merging: rows
        .filter((row) => row.id !== canonical.id)
        .map((row) => ({ id: row.id, make: row.make, model: row.model, category: row.category, evidence: evidence.get(row.id) || 0 })),
      makeMismatches,
    }
  })

  console.log(JSON.stringify({ clusters: clusterReports }, null, 2))

  if (!applyChanges) {
    console.log('\nDry run only — no writes made. Re-run with --apply to merge.')
    return
  }

  const summary = {
    clustersMerged: 0,
    rowsDeactivated: 0,
    makeCorrected: 0,
    updatedRefs: {
      competitor_prices: 0,
      market_prices: 0,
      pricing_tables: 0,
      trained_pricing_baselines: 0,
      device_last_manual_prices: 0,
      order_items: 0,
      imei_records: 0,
      sales_history: 0,
      international_prices: 0,
      pricing_training_data: 0,
    },
  }

  for (const [, rows] of duplicateGroups) {
    const canonical = rows.reduce((best, row) => preferCandidate(best, row, evidence))
    const duplicates = rows.filter((row) => row.id !== canonical.id)
    const identity = identities.get(canonical.id)!

    const correctMake = resolveMakeColumn(canonical.make) !== identity.brand
    if (correctMake) {
      const display = BRAND_DISPLAY[identity.brand] || identity.brand
      const { error } = await supabase.from('device_catalog').update({ make: display }).eq('id', canonical.id)
      if (error) throw new Error(`Failed to correct make for ${canonical.id}: ${error.message}`)
      summary.makeCorrected += 1
    }

    for (const duplicate of duplicates) {
      summary.updatedRefs.competitor_prices += await moveUniqueRows('competitor_prices', duplicate.id, canonical.id)
      summary.updatedRefs.market_prices += await moveUniqueRows('market_prices', duplicate.id, canonical.id)
      summary.updatedRefs.pricing_tables += await moveUniqueRows('pricing_tables', duplicate.id, canonical.id)
      summary.updatedRefs.trained_pricing_baselines += await moveUniqueRows('trained_pricing_baselines', duplicate.id, canonical.id)
      summary.updatedRefs.international_prices += await moveUniqueRows('international_prices', duplicate.id, canonical.id)
      summary.updatedRefs.device_last_manual_prices += await moveManualPrices(duplicate.id, canonical.id)

      for (const table of STRAIGHT_MOVE_TABLES) {
        summary.updatedRefs[table] += await moveStraightRefs(table, duplicate.id, canonical.id)
      }

      const { error } = await supabase
        .from('device_catalog')
        .update({ is_active: false, merged_into_device_id: canonical.id })
        .eq('id', duplicate.id)
      if (error) throw new Error(`Failed to deactivate ${duplicate.id}: ${error.message}`)
      summary.rowsDeactivated += 1
    }

    summary.clustersMerged += 1
  }

  console.log('\nMerge complete')
  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error('Dedupe failed:', error)
  process.exit(1)
})
