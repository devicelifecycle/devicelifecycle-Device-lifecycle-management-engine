import { createClient } from '@supabase/supabase-js'

type CompetitorRow = {
  device_id: string | null
  storage: string | null
  competitor_name: string | null
  condition: string | null
  source: string | null
  scraped_at: string | null
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const pageSize = 1000
  let from = 0
  let totalRows = 0
  let staleAutoRows = 0

  const staleCutoff = Date.now() - 14 * 24 * 60 * 60 * 1000
  const keyCounts = new Map<string, number>()

  for (;;) {
    const to = from + pageSize - 1
    const { data, error } = await supabase
      .from('competitor_prices')
      .select('device_id,storage,competitor_name,condition,source,scraped_at')
      .range(from, to)

    if (error) throw new Error(`Audit query failed: ${error.message}`)

    const rows = (data ?? []) as CompetitorRow[]
    if (rows.length === 0) break

    totalRows += rows.length

    for (const row of rows) {
      const key = [
        row.device_id ?? '',
        row.storage ?? '',
        row.competitor_name ?? '',
        row.condition ?? '',
      ].join('|')
      keyCounts.set(key, (keyCounts.get(key) ?? 0) + 1)

      const source = (row.source ?? '').toLowerCase()
      if (source !== 'manual' && row.scraped_at) {
        const ts = Date.parse(row.scraped_at)
        if (!Number.isNaN(ts) && ts < staleCutoff) {
          staleAutoRows += 1
        }
      }
    }

    if (rows.length < pageSize) break
    from += pageSize
  }

  let duplicateKeyGroups = 0
  let duplicateExtraRows = 0
  for (const count of keyCounts.values()) {
    if (count > 1) {
      duplicateKeyGroups += 1
      duplicateExtraRows += count - 1
    }
  }

  const report = {
    checked_at: new Date().toISOString(),
    total_rows: totalRows,
    distinct_conflict_keys: keyCounts.size,
    duplicate_key_groups: duplicateKeyGroups,
    duplicate_extra_rows: duplicateExtraRows,
    stale_non_manual_rows_older_than_14_days: staleAutoRows,
  }

  console.log(JSON.stringify(report, null, 2))

  if (duplicateExtraRows > 0) {
    process.exitCode = 2
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
})
