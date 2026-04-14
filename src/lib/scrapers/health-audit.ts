import type { SupabaseClient } from '@supabase/supabase-js'

type HealthAuditRow = {
  device_id: string | null
  storage: string | null
  competitor_name: string | null
  condition: string | null
  source: string | null
  scraped_at: string | null
}

export interface CompetitorPriceHealthAudit {
  checked_at: string
  total_rows: number
  distinct_conflict_keys: number
  duplicate_key_groups: number
  duplicate_extra_rows: number
  stale_non_manual_rows_older_than_14_days: number
}

export async function auditCompetitorPricesHealth(
  supabase: SupabaseClient,
  staleDays = 14
): Promise<CompetitorPriceHealthAudit> {
  const pageSize = 1000
  let from = 0
  let totalRows = 0
  let staleAutoRows = 0
  const staleCutoff = Date.now() - staleDays * 24 * 60 * 60 * 1000
  const keyCounts = new Map<string, number>()

  for (;;) {
    const to = from + pageSize - 1
    const { data, error } = await supabase
      .from('competitor_prices')
      .select('device_id,storage,competitor_name,condition,source,scraped_at')
      .range(from, to)

    if (error) throw new Error(`Health audit query failed: ${error.message}`)

    const rows = (data ?? []) as HealthAuditRow[]
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

  return {
    checked_at: new Date().toISOString(),
    total_rows: totalRows,
    distinct_conflict_keys: keyCounts.size,
    duplicate_key_groups: duplicateKeyGroups,
    duplicate_extra_rows: duplicateExtraRows,
    stale_non_manual_rows_older_than_14_days: staleAutoRows,
  }
}
