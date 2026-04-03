// ============================================================================
// PRICING SCRAPE CHANGES
// Returns competitor prices updated within the last N hours, optionally as CSV
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'coe_manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const hoursParam = parseInt(request.nextUrl.searchParams.get('hours') || '24', 10)
    const hours = Math.max(1, Math.min(hoursParam, 720)) // clamp 1h–30d
    const format = request.nextUrl.searchParams.get('format') || 'json'

    const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

    const serviceSupabase = createServiceRoleClient()
    const { data: rows, error } = await serviceSupabase
      .from('competitor_prices')
      .select('id, device_id, storage, competitor_name, condition, trade_in_price, sell_price, source, scraped_at, updated_at, device:device_catalog(make, model)')
      .gte('updated_at', since)
      .order('updated_at', { ascending: false })
      .limit(5000)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const changes = (rows || []).map(r => {
      const device = r.device as { make?: string; model?: string } | null
      return {
        id: r.id,
        device_id: r.device_id,
        make: device?.make || '',
        model: device?.model || '',
        storage: r.storage,
        competitor: r.competitor_name,
        condition: r.condition,
        trade_in_price: r.trade_in_price,
        sell_price: r.sell_price,
        source: r.source,
        scraped_at: r.scraped_at,
        updated_at: r.updated_at,
      }
    })

    if (format === 'csv') {
      const headers = ['make', 'model', 'storage', 'competitor', 'condition', 'trade_in_price', 'sell_price', 'source', 'scraped_at', 'updated_at']
      const csvRows = [
        headers.join(','),
        ...changes.map(r =>
          headers.map(h => {
            const val = r[h as keyof typeof r]
            if (val == null) return ''
            const str = String(val)
            return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str
          }).join(',')
        ),
      ]
      return new NextResponse(csvRows.join('\n'), {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="price-changes-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      })
    }

    return NextResponse.json({ data: changes, total: changes.length, since, hours })
  } catch (error) {
    console.error('Price changes error:', error)
    return NextResponse.json({ error: 'Failed to fetch price changes' }, { status: 500 })
  }
}
