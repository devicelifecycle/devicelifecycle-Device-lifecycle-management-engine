// ============================================================================
// COMPETITOR PRICE SYNC CRON API ROUTE
// Fetches competitor prices from CSV URL and upserts to competitor_prices
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { timingSafeEqual } from 'crypto'

const CRON_SECRET = process.env.CRON_SECRET
const SYNC_ENABLED = process.env.COMPETITOR_SYNC_ENABLED === 'true'
const CSV_URL = process.env.COMPETITOR_CSV_URL

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

export async function GET(request: NextRequest) {
  try {
    if (!CRON_SECRET) {
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
    }
    const authHeader = request.headers.get('authorization') || ''
    if (!safeCompare(authHeader, `Bearer ${CRON_SECRET}`)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!SYNC_ENABLED) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'COMPETITOR_SYNC_ENABLED is not true',
        timestamp: new Date().toISOString(),
      })
    }

    if (!CSV_URL) {
      return NextResponse.json({
        success: true,
        skipped: true,
        reason: 'COMPETITOR_CSV_URL not configured',
        timestamp: new Date().toISOString(),
      })
    }

    const res = await fetch(CSV_URL)
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

    const headers = lines[0].toLowerCase().replace(/\s/g, '_').split(',')
    const deviceIdIdx = headers.indexOf('device_id')
    const storageIdx = headers.indexOf('storage')
    const competitorIdx = headers.indexOf('competitor_name')
    const tradeIdx = headers.indexOf('trade_in_price')
    const sellIdx = headers.indexOf('sell_price')

    if (deviceIdIdx < 0 || storageIdx < 0 || competitorIdx < 0) {
      return NextResponse.json({
        success: false,
        error: 'CSV must have device_id, storage, competitor_name columns',
        timestamp: new Date().toISOString(),
      }, { status: 400 })
    }

    const supabase = createServerSupabaseClient()
    let imported = 0
    const errors: string[] = []

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',').map(v => v.trim())
      const deviceId = values[deviceIdIdx]
      const storage = values[storageIdx]
      const competitorName = values[competitorIdx]
      const tradeInPrice = tradeIdx >= 0 ? parseFloat(values[tradeIdx] || '0') : undefined
      const sellPrice = sellIdx >= 0 ? parseFloat(values[sellIdx] || '0') : undefined

      if (!deviceId || !storage || !competitorName) {
        errors.push(`Row ${i + 1}: missing required fields`)
        continue
      }

      const { data: existing } = await supabase
        .from('competitor_prices')
        .select('id')
        .eq('device_id', deviceId)
        .eq('storage', storage)
        .eq('competitor_name', competitorName)
        .limit(1)
        .single()

      const row = {
        device_id: deviceId,
        storage,
        competitor_name: competitorName,
        trade_in_price: Number.isNaN(tradeInPrice) ? null : tradeInPrice,
        sell_price: Number.isNaN(sellPrice) ? null : sellPrice,
        source: 'scraped',
        scraped_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      if (existing?.id) {
        const { error } = await supabase.from('competitor_prices').update(row).eq('id', existing.id)
        if (error) errors.push(`Row ${i + 1}: ${error.message}`)
        else imported++
      } else {
        const { error } = await supabase.from('competitor_prices').insert(row)
        if (error) errors.push(`Row ${i + 1}: ${error.message}`)
        else imported++
      }
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
