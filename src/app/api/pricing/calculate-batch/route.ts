// ============================================================================
// BATCH PRICE CALCULATE API
// Returns formula-derived trade/CPO prices for device+storage+condition combos.
// Used to fill matrix cells that have no competitor data. When scraper/upload
// adds data, those cells auto-update on next fetch.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PricingService } from '@/services/pricing.service'
export const dynamic = 'force-dynamic'


const mapConditionToInternal = (c: string): 'new' | 'excellent' | 'good' | 'fair' | 'poor' => {
  if (c === 'excellent') return 'excellent'
  if (c === 'fair') return 'fair'
  if (c === 'broken') return 'poor'
  return 'good'
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile && ['customer', 'vendor'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const items = Array.isArray(body.items) ? body.items : body.items ? [body.items] : []
    const priceMode = body.price_mode === 'cpo' ? 'cpo' : 'trade_in'
    const limit = Math.min(items.length, 80)

    if (limit === 0) {
      return NextResponse.json({ data: [] })
    }

    const CONCURRENCY = 8
    const results: Array<{
      key: string
      device_id: string
      storage: string
      condition: string
      trade_price?: number
      cpo_price?: number
      error?: string
    }> = []

    const processItem = async (item: { key?: string; device_id?: string; deviceId?: string; storage?: string; condition?: string }, index: number) => {
      const device_id = item.device_id || item.deviceId
      const storage = (item.storage || '128GB').replace(/\s+/g, '').toUpperCase()
      const condition = (item.condition || 'good') as string
      const key = item.key ?? `${device_id}|${storage}|${condition}`

      if (!device_id) {
        return { key, device_id: '', storage, condition, error: 'device_id required' }
      }

      try {
        const result = await PricingService.calculatePriceV2({
          device_id,
          storage,
          carrier: 'Unlocked',
          condition: mapConditionToInternal(condition),
          quantity: 1,
        })

        if (!result.success || result.error) {
          return { key, device_id, storage, condition, error: result.error || 'Calculation failed' }
        }

        const trade = result.trade_price ?? 0
        const cpo = result.cpo_price ?? result.trade_price ?? 0
        return { key, device_id, storage, condition, trade_price: trade, cpo_price: cpo }
      } catch (err) {
        return { key, device_id, storage, condition, error: err instanceof Error ? err.message : 'Unknown error' }
      }
    }

    const batch = items.slice(0, limit)
    for (let i = 0; i < batch.length; i += CONCURRENCY) {
      const chunk = batch.slice(i, i + CONCURRENCY)
      const chunkResults = await Promise.all(chunk.map((item: Record<string, unknown>, j: number) => processItem(item as { key?: string; device_id?: string; deviceId?: string; storage?: string; condition?: string }, i + j)))
      results.push(...chunkResults)
    }

    return NextResponse.json({
      data: results,
      price_mode: priceMode,
    })
  } catch (error) {
    console.error('Error in batch calculate:', error)
    return NextResponse.json(
      { error: 'Failed to calculate batch prices' },
      { status: 500 }
    )
  }
}
