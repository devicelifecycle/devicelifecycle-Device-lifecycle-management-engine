// ============================================================================
// COMPETITOR PRICE SYNC CRON API ROUTE
// Fetches competitor prices from CSV URL and upserts to competitor_prices
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { readBooleanServerEnv, readServerEnv } from '@/lib/server-env'
import { timingSafeEqual } from 'crypto'

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

function parseCsvRow(line: string): string[] {
  const values: string[] = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index++) {
    const char = line[index]
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"'
        index++
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      values.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  values.push(current.trim())
  return values
}

type CompetitorRow = {
  device_id: string
  storage: string
  competitor_name: string
  condition: 'excellent' | 'good' | 'fair' | 'broken'
  trade_in_price: number | null
  sell_price: number | null
  source: 'scraped'
  scraped_at: string
  updated_at: string
}

async function upsertCompetitorRow(supabase: ReturnType<typeof createServiceRoleClient>, row: CompetitorRow) {
  const { error: upsertError } = await supabase
    .from('competitor_prices')
    .upsert(row, {
      onConflict: 'device_id,storage,competitor_name,condition',
      ignoreDuplicates: false,
    })

  if (!upsertError) return { success: true as const }

  const code = (upsertError as { code?: string } | null)?.code
  if (code !== '42P10') {
    return { success: false as const, error: upsertError.message }
  }

  const { data: existing } = await supabase
    .from('competitor_prices')
    .select('id')
    .eq('device_id', row.device_id)
    .eq('storage', row.storage)
    .eq('competitor_name', row.competitor_name)
    .eq('condition', row.condition)
    .limit(1)
    .single()

  if (existing?.id) {
    const { error } = await supabase.from('competitor_prices').update(row).eq('id', existing.id)
    if (error) return { success: false as const, error: error.message }
    return { success: true as const }
  }

  const { error } = await supabase.from('competitor_prices').insert(row)
  if (error) return { success: false as const, error: error.message }
  return { success: true as const }
}

export async function GET(request: NextRequest) {
  try {
    const cronSecret = readServerEnv('CRON_SECRET')
    const syncEnabled = readBooleanServerEnv('COMPETITOR_SYNC_ENABLED')
    const csvUrl = readServerEnv('COMPETITOR_CSV_URL')

    if (!cronSecret) {
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
    }
    const authHeader = request.headers.get('authorization') || ''
    if (!safeCompare(authHeader, `Bearer ${cronSecret}`)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!syncEnabled) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'COMPETITOR_SYNC_ENABLED is not true',
        timestamp: new Date().toISOString(),
      })
    }

    if (!csvUrl) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'COMPETITOR_CSV_URL not configured',
        timestamp: new Date().toISOString(),
      })
    }

    const res = await fetch(csvUrl, { cache: 'no-store' })
    if (!res.ok) throw new Error(`Failed to fetch CSV: ${res.status}`)
    const csvText = await res.text()

    const lines = csvText.split('\n').filter(Boolean)
    if (lines.length < 2) {
      return NextResponse.json({
        success: true,
        imported: 0,
        reason: 'CSV empty or header only',
        timestamp: new Date().toISOString(),
      })
    }

    const headers = parseCsvRow(lines[0].toLowerCase().replace(/\s/g, '_'))
    const deviceIdIdx = headers.indexOf('device_id')
    const storageIdx = headers.indexOf('storage')
    const competitorIdx = headers.indexOf('competitor_name')
    const conditionIdx = headers.indexOf('condition')
    const tradeIdx = headers.indexOf('trade_in_price')
    const sellIdx = headers.indexOf('sell_price')

    if (deviceIdIdx < 0 || storageIdx < 0 || competitorIdx < 0) {
      return NextResponse.json({
        success: false,
        error: 'CSV must have device_id, storage, competitor_name columns',
        timestamp: new Date().toISOString(),
      }, { status: 400 })
    }

    // Use service-role client to bypass RLS (cron has no user session)
    const supabase = createServiceRoleClient()
    let imported = 0
    const errors: string[] = []

    for (let i = 1; i < lines.length; i++) {
      const values = parseCsvRow(lines[i])
      const deviceId = values[deviceIdIdx]
      const storage = values[storageIdx]
      const competitorName = values[competitorIdx]
      const conditionRaw = conditionIdx >= 0 ? (values[conditionIdx] || 'good').toLowerCase() : 'good'
      const condition = conditionRaw === 'excellent' || conditionRaw === 'fair' || conditionRaw === 'broken' ? conditionRaw : 'good'
      const tradeInPrice = tradeIdx >= 0 ? parseFloat(values[tradeIdx] || '0') : null
      const sellPrice = sellIdx >= 0 ? parseFloat(values[sellIdx] || '0') : null

      if (!deviceId || !storage || !competitorName) {
        errors.push(`Row ${i + 1}: missing required fields`)
        continue
      }

      const row: CompetitorRow = {
        device_id: deviceId,
        storage,
        competitor_name: competitorName,
        condition,
        trade_in_price: tradeInPrice !== null && Number.isNaN(tradeInPrice) ? null : tradeInPrice,
        sell_price: sellPrice !== null && Number.isNaN(sellPrice) ? null : sellPrice,
        source: 'scraped',
        scraped_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      const result = await upsertCompetitorRow(supabase, row)
      if (!result.success) errors.push(`Row ${i + 1}: ${result.error}`)
      else imported++
    }

    // Notify admins about CSV sync
    if (imported > 0) {
      const { NotificationService } = await import('@/services/notification.service')
      NotificationService.sendPriceUpdateNotification({
        source: 'csv_sync',
        total_updated: imported,
        details: errors.length > 0 ? `${errors.length} rows had errors` : undefined,
      }).catch(err => console.error('Price notification error:', err))
    }

    return NextResponse.json({
      success: true,
      imported,
      errors: errors.slice(0, 5),
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Competitor sync error:', error)
    const { safeErrorMessage } = await import('@/lib/utils')
    return NextResponse.json(
      { error: safeErrorMessage(error, 'Sync failed') },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
