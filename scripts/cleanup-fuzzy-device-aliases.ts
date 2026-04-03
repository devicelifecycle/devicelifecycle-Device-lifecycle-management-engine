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

const applyChanges = process.argv.includes('--apply')

type GenericRow = Record<string, unknown> & { id: string; device_id?: string | null }

type AliasMerge = {
  label: string
  aliasId: string
  canonicalId: string
}

const MERGE_PLAN: AliasMerge[] = [
  {
    label: 'Samsung Galaxy Note 10 Plus -> Galaxy Note 10+',
    aliasId: '6ca5eefe-eae6-43d1-a5d6-008e85cadb7c',
    canonicalId: '0436f8d8-87dc-472c-96e3-d0336e6e48a8',
  },
  {
    label: 'Samsung Galaxy S24 Plus -> Galaxy S24+',
    aliasId: 'd2f82c48-a0cc-44e5-8d5d-15947ceff444',
    canonicalId: 'ef0fc670-6936-49be-ac78-367f33ab0b2a',
  },
  {
    label: 'Samsung Galaxy S25 Plus -> Galaxy S25+',
    aliasId: '5c4a8abc-2254-40ac-8ca4-40bf96e07425',
    canonicalId: 'eb48d914-864e-4b01-9cab-cfb1cf9411ea',
  },
  {
    label: 'Samsung Galaxy S26 Plus -> Galaxy S26+',
    aliasId: '3f4cbcd8-6b10-4d7f-b069-32e76dc4dc7c',
    canonicalId: '86a03090-c481-420f-b522-c36914ef4b1e',
  },
  {
    label: 'Samsung Galaxy Tab S10 Plus -> Galaxy Tab S10+',
    aliasId: 'b973422a-5661-4c9b-a8d8-d2b8e6e0d687',
    canonicalId: '7e64dc71-13fc-4332-8e23-79ff8da6c102',
  },
  {
    label: 'Samsung Galaxy Tab S9 Plus -> Galaxy Tab S9+',
    aliasId: '8081a0ef-4216-414e-ab45-1930e4d06cd8',
    canonicalId: 'af4aeddc-477d-42f9-8d95-b32f725e6dc2',
  },
  {
    label: 'Apple iPad Pro 12.9" (M2) -> iPad Pro 12.9-inch (M2)',
    aliasId: 'd0040000-0000-0000-0000-000000000001',
    canonicalId: '534b1e35-4cf9-4f54-826c-acb62832208d',
  },
]

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

function timestampValue(value: unknown): number {
  if (!value || typeof value !== 'string') return 0
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : 0
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

async function fetchAllRowsForDevice(table: string, deviceId: string): Promise<GenericRow[]> {
  const rows: GenericRow[] = []
  const pageSize = 1000

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('device_id', deviceId)
      .range(from, from + pageSize - 1)

    if (error) throw new Error(`Failed to read ${table} rows for ${deviceId}: ${error.message}`)
    const batch = (data || []) as GenericRow[]
    rows.push(...batch)
    if (batch.length < pageSize) break
  }

  return rows
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
  const sourceRows = await fetchAllRowsForDevice(table, fromId)
  if (!sourceRows.length) return 0

  const targetRows = await fetchAllRowsForDevice(table, toId)
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

async function describeDevice(id: string) {
  const { data, error } = await supabase
    .from('device_catalog')
    .select('id, make, model, category, variant, sku, is_active')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(`Failed to load device ${id}: ${error.message}`)
  return data
}

async function main() {
  console.log(applyChanges ? 'Mode: APPLY' : 'Mode: DRY RUN')

  const preview = []
  const actionableMerges: AliasMerge[] = []
  const skippedAlreadyMerged: string[] = []

  for (const merge of MERGE_PLAN) {
    const alias = await describeDevice(merge.aliasId)
    const canonical = await describeDevice(merge.canonicalId)

    if (!canonical) {
      throw new Error(`Canonical device ${merge.canonicalId} for "${merge.label}" is missing`)
    }

    if (!alias) {
      skippedAlreadyMerged.push(merge.label)
      preview.push({ label: merge.label, status: 'already_merged', alias: null, canonical })
      continue
    }

    actionableMerges.push(merge)
    preview.push({ label: merge.label, status: 'pending', alias, canonical })
  }
  console.log(JSON.stringify({ preview, skipped_already_merged: skippedAlreadyMerged }, null, 2))

  if (!applyChanges) return

  const updatedRefs: Record<string, number> = {
    competitor_prices: 0,
    market_prices: 0,
    pricing_tables: 0,
    trained_pricing_baselines: 0,
    order_items: 0,
    imei_records: 0,
    sales_history: 0,
    international_prices: 0,
    pricing_training_data: 0,
  }

  let deletedDevices = 0

  for (const merge of actionableMerges) {
    updatedRefs.competitor_prices += await moveUniqueRows('competitor_prices', merge.aliasId, merge.canonicalId)
    updatedRefs.market_prices += await moveUniqueRows('market_prices', merge.aliasId, merge.canonicalId)
    updatedRefs.pricing_tables += await moveUniqueRows('pricing_tables', merge.aliasId, merge.canonicalId)
    updatedRefs.trained_pricing_baselines += await moveUniqueRows('trained_pricing_baselines', merge.aliasId, merge.canonicalId)
    updatedRefs.international_prices += await moveUniqueRows('international_prices', merge.aliasId, merge.canonicalId)

    for (const table of STRAIGHT_MOVE_TABLES) {
      updatedRefs[table] += await moveStraightRefs(table, merge.aliasId, merge.canonicalId)
    }

    const deleted = await deleteDeviceIfOrphaned(merge.aliasId)
    if (!deleted) {
      throw new Error(`Alias device ${merge.aliasId} still has references after merge and was not deleted`)
    }
    deletedDevices += 1
  }

  console.log('\nCleanup complete')
  console.log(JSON.stringify({
    merged_alias_groups: actionableMerges.length,
    skipped_already_merged: skippedAlreadyMerged,
    deleted_devices: deletedDevices,
    updated_refs: updatedRefs,
  }, null, 2))
}

main().catch((error) => {
  console.error('Fuzzy alias cleanup failed:', error)
  process.exit(1)
})
