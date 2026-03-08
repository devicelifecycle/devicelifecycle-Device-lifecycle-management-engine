// ============================================================================
// PRICING HEALTH SERVICE
// ============================================================================

import { createServiceRoleClient } from '@/lib/supabase/service-role'

interface FreshnessEntry {
  device_id: string
  storage: string
  condition: 'excellent' | 'good' | 'fair' | 'broken'
  label: string
  latest_at: string
  age_days: number
}

export interface PricingStalenessResult {
  threshold_days: number
  checked_groups: number
  stale_groups: number
  max_age_days: number | null
  stale_examples: FreshnessEntry[]
  notifications_sent: number
  notifications_skipped: number
}

const DEFAULT_THRESHOLD_DAYS = 7
const ALERT_TITLE = 'Pricing data stale alert'

function daysBetween(now: Date, thenIso?: string | null): number {
  if (!thenIso) return Number.POSITIVE_INFINITY
  const then = new Date(thenIso)
  const ms = now.getTime() - then.getTime()
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)))
}

function normalizeCondition(input?: string | null): 'excellent' | 'good' | 'fair' | 'broken' {
  if (input === 'excellent' || input === 'fair' || input === 'broken') return input
  return 'good'
}

export class PricingHealthService {
  static async checkCompetitorPriceStaleness(): Promise<PricingStalenessResult> {
    const supabase = createServiceRoleClient()
    const now = new Date()

    const { data: settingRows } = await supabase
      .from('pricing_settings')
      .select('setting_key, setting_value')
      .eq('setting_key', 'price_staleness_days')
      .limit(1)

    const parsedThreshold = parseInt(settingRows?.[0]?.setting_value || '', 10)
    const thresholdDays = Number.isFinite(parsedThreshold) && parsedThreshold >= 0
      ? parsedThreshold
      : DEFAULT_THRESHOLD_DAYS

    const { data: rows, error } = await supabase
      .from('competitor_prices')
      .select('device_id, storage, condition, scraped_at, updated_at, device:device_catalog(make, model)')

    if (error) {
      throw new Error(`Failed to read competitor prices: ${error.message}`)
    }

    type Row = {
      device_id: string
      storage: string
      condition?: string | null
      scraped_at?: string | null
      updated_at?: string | null
      device?: { make?: string | null; model?: string | null } | null
    }

    const latestByGroup = new Map<string, FreshnessEntry>()

    for (const row of (rows || []) as Row[]) {
      const condition = normalizeCondition(row.condition)
      const storage = row.storage || 'Unknown'
      const label = row.device?.make && row.device?.model
        ? `${row.device.make} ${row.device.model}`
        : row.device_id

      const latestAt = row.updated_at || row.scraped_at || null
      const ageDays = daysBetween(now, latestAt)
      const key = `${row.device_id}|${storage}|${condition}`

      const existing = latestByGroup.get(key)
      if (!existing || (latestAt || '') > existing.latest_at) {
        latestByGroup.set(key, {
          device_id: row.device_id,
          storage,
          condition,
          label,
          latest_at: latestAt || '',
          age_days: ageDays,
        })
      }
    }

    const groups = Array.from(latestByGroup.values())
    const stale = groups
      .filter((group) => group.age_days > thresholdDays)
      .sort((left, right) => right.age_days - left.age_days)

    const recipientsQuery = await supabase
      .from('users')
      .select('id')
      .in('role', ['admin', 'coe_manager'])

    const recipients = (recipientsQuery.data || []) as Array<{ id: string }>

    let notificationsSent = 0
    let notificationsSkipped = 0

    if (stale.length > 0 && recipients.length > 0) {
      const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
      const sample = stale.slice(0, 3)
      const sampleText = sample
        .map((entry) => `${entry.label} ${entry.storage} ${entry.condition} (${entry.age_days}d)`)
        .join(', ')

      for (const recipient of recipients) {
        const { data: existingRecent } = await supabase
          .from('notifications')
          .select('id')
          .eq('user_id', recipient.id)
          .eq('title', ALERT_TITLE)
          .gte('created_at', since)
          .limit(1)
          .maybeSingle()

        if (existingRecent?.id) {
          notificationsSkipped++
          continue
        }

        const { error: insertError } = await supabase
          .from('notifications')
          .insert({
            user_id: recipient.id,
            type: 'in_app',
            title: ALERT_TITLE,
            message: `${stale.length} pricing groups are older than ${thresholdDays} days. Top stale: ${sampleText}`,
            metadata: {
              kind: 'pricing_staleness_alert',
              stale_groups: stale.length,
              threshold_days: thresholdDays,
              max_age_days: stale[0]?.age_days ?? null,
              generated_at: now.toISOString(),
            },
          })

        if (insertError) {
          notificationsSkipped++
          continue
        }
        notificationsSent++
      }
    }

    return {
      threshold_days: thresholdDays,
      checked_groups: groups.length,
      stale_groups: stale.length,
      max_age_days: stale.length > 0 ? stale[0].age_days : null,
      stale_examples: stale.slice(0, 20),
      notifications_sent: notificationsSent,
      notifications_skipped: notificationsSkipped,
    }
  }
}
