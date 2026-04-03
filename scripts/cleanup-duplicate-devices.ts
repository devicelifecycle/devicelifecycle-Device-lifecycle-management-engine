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

const args = new Set(process.argv.slice(2))
const applyChanges = args.has('--apply')

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

type GenericRow = Record<string, unknown> & { id: string; device_id?: string | null }

type MergeSummary = {
  duplicateGroups: number
  duplicateRows: number
  keptDevices: number
  deletedDevices: number
  updatedRefs: Record<string, number>
}

const STRAIGHT_MOVE_TABLES = [
  'order_items',
  'imei_records',
  'sales_history',
  'pricing_training_data',
] as const

const UNIQUE_MERGE_TABLES = [
  'competitor_prices',
  'market_prices',
  'pricing_tables',
  'trained_pricing_baselines',
  'international_prices',
] as const

function exactDeviceKey(row: DeviceRow): string {
  return [
    row.make || '',
    row.model || '',
    row.category || '',
    row.variant || '',
  ].join('||')
}

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
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + pageSize - 1)

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
  for (let i = 0; i < deviceIds.length; i += 200) {
    chunks.push(deviceIds.slice(i, i + 200))
  }

  for (const chunk of chunks) {
    const [competitors, market, pricing, baselines, orderItems, imei, history, internationalPrices, training] = await Promise.all([
      supabase.from('competitor_prices').select('device_id').in('device_id', chunk),
      supabase.from('market_prices').select('device_id').in('device_id', chunk),
      supabase.from('pricing_tables').select('device_id').in('device_id', chunk),
      supabase.from('trained_pricing_baselines').select('device_id').in('device_id', chunk),
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
    addWeight((orderItems.data || []) as Array<{ device_id: string | null }>, 3)
    addWeight((imei.data || []) as Array<{ device_id: string | null }>, 3)
    addWeight((history.data || []) as Array<{ device_id: string | null }>, 2)
    addWeight((internationalPrices.data || []) as Array<{ device_id: string | null }>, 2)
    addWeight((training.data || []) as Array<{ device_id: string | null }>, 1)
  }

  return evidence
}

function mergeRow(table: string, current: GenericRow, incoming: GenericRow): GenericRow {
  const currentUpdated = Math.max(
    timestampValue(current.updated_at),
    timestampValue(current.scraped_at),
    timestampValue(current.last_trained_at),
    timestampValue(current.created_at)
  )
  const incomingUpdated = Math.max(
    timestampValue(incoming.updated_at),
    timestampValue(incoming.scraped_at),
    timestampValue(incoming.last_trained_at),
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

    const { error: mergeError } = await supabase.from(table).update(updatePayload).eq('id', existing.id)
    if (mergeError) throw new Error(`Failed to merge ${table} row ${row.id}: ${mergeError.message}`)

    const { error: deleteError } = await supabase.from(table).delete().eq('id', row.id)
    if (deleteError) throw new Error(`Failed to delete duplicate ${table} row ${row.id}: ${deleteError.message}`)
    moved += 1
  }

  return moved
}

async function deleteDeviceIfOrphaned(deviceId: string): Promise<boolean> {
  const checks = await Promise.all([
    supabase.from('competitor_prices').select('id', { count: 'exact', head: true }).eq('device_id', deviceId),
    supabase.from('market_prices').select('id', { count: 'exact', head: true }).eq('device_id', deviceId),
    supabase.from('pricing_tables').select('id', { count: 'exact', head: true }).eq('device_id', deviceId),
    supabase.from('trained_pricing_baselines').select('id', { count: 'exact', head: true }).eq('device_id', deviceId),
    supabase.from('order_items').select('id', { count: 'exact', head: true }).eq('device_id', deviceId),
    supabase.from('imei_records').select('id', { count: 'exact', head: true }).eq('device_id', deviceId),
    supabase.from('sales_history').select('id', { count: 'exact', head: true }).eq('device_id', deviceId),
    supabase.from('international_prices').select('id', { count: 'exact', head: true }).eq('device_id', deviceId),
    supabase.from('pricing_training_data').select('id', { count: 'exact', head: true }).eq('device_id', deviceId),
  ])

  const stillReferenced = checks.some((result) => (result.count || 0) > 0)
  if (stillReferenced) return false

  const { error } = await supabase.from('device_catalog').delete().eq('id', deviceId)
  if (error) throw new Error(`Failed to delete device ${deviceId}: ${error.message}`)
  return true
}

async function main() {
  const devices = await fetchAll<DeviceRow>(
    'device_catalog',
    'id, make, model, category, variant, sku, is_active, created_at'
  )

  const groups = new Map<string, DeviceRow[]>()
  for (const device of devices) {
    const key = exactDeviceKey(device)
    const list = groups.get(key) || []
    list.push(device)
    groups.set(key, list)
  }

  const duplicateGroups = [...groups.values()].filter((rows) => rows.length > 1)
  const allDuplicateIds = duplicateGroups.flatMap((rows) => rows.map((row) => row.id))
  const evidence = await countEvidence(allDuplicateIds)

  const summary: MergeSummary = {
    duplicateGroups: duplicateGroups.length,
    duplicateRows: duplicateGroups.reduce((sum, rows) => sum + rows.length - 1, 0),
    keptDevices: duplicateGroups.length,
    deletedDevices: 0,
    updatedRefs: {
      competitor_prices: 0,
      market_prices: 0,
      pricing_tables: 0,
      trained_pricing_baselines: 0,
      order_items: 0,
      imei_records: 0,
      sales_history: 0,
      international_prices: 0,
      pricing_training_data: 0,
    },
  }

  console.log(`Duplicate groups: ${summary.duplicateGroups}`)
  console.log(`Duplicate rows to remove: ${summary.duplicateRows}`)
  console.log(applyChanges ? 'Mode: APPLY' : 'Mode: DRY RUN')

  const preview = duplicateGroups.slice(0, 12).map((rows) => {
    const canonical = rows.reduce((best, row) => preferCandidate(best, row, evidence))
    return {
      key: exactDeviceKey(canonical),
      keep: canonical.id,
      remove: rows.filter((row) => row.id !== canonical.id).map((row) => row.id),
      active_count: rows.filter((row) => row.is_active).length,
    }
  })
  console.log(JSON.stringify({ preview }, null, 2))

  if (!applyChanges) return

  for (const rows of duplicateGroups) {
    const canonical = rows.reduce((best, row) => preferCandidate(best, row, evidence))
    const duplicates = rows.filter((row) => row.id !== canonical.id)

    for (const duplicate of duplicates) {
      summary.updatedRefs.competitor_prices += await moveUniqueRows('competitor_prices', duplicate.id, canonical.id)
      summary.updatedRefs.market_prices += await moveUniqueRows('market_prices', duplicate.id, canonical.id)
      summary.updatedRefs.pricing_tables += await moveUniqueRows('pricing_tables', duplicate.id, canonical.id)
      summary.updatedRefs.trained_pricing_baselines += await moveUniqueRows('trained_pricing_baselines', duplicate.id, canonical.id)
      summary.updatedRefs.international_prices += await moveUniqueRows('international_prices', duplicate.id, canonical.id)

      for (const table of STRAIGHT_MOVE_TABLES) {
        summary.updatedRefs[table] += await moveStraightRefs(table, duplicate.id, canonical.id)
      }

      const deleted = await deleteDeviceIfOrphaned(duplicate.id)
      if (!deleted) {
        throw new Error(`Device ${duplicate.id} still has references after merge and was not deleted`)
      }
      summary.deletedDevices += 1
    }
  }

  console.log('\nCleanup complete')
  console.log(JSON.stringify(summary, null, 2))
}

main().catch((error) => {
  console.error('Duplicate cleanup failed:', error)
  process.exit(1)
})
