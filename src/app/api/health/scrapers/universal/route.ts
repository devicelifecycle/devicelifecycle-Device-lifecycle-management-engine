// ============================================================================
// UNIVERSAL SCRAPER HEALTH API ROUTE
// Reports last scraper source URL used (primary/fallback) and timestamp
// ============================================================================

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
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

    if (profile && ['customer', 'vendor'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('pricing_settings')
      .select('setting_key, setting_value')
      .in('setting_key', [
        'last_universal_source_url',
        'last_universal_source_at',
        'last_universal_source_status',
        'last_universal_source_fallback_used',
      ])

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch health settings' }, { status: 500 })
    }

    const settings = Object.fromEntries((data || []).map((row) => [row.setting_key, row.setting_value]))
    const sourceUrl = settings.last_universal_source_url || null
    const checkedAt = settings.last_universal_source_at || null
    const status = settings.last_universal_source_status || 'unknown'
    const fallbackUsed = settings.last_universal_source_fallback_used === 'true'

    return NextResponse.json({
      success: true,
      scraper: 'UniverCell',
      source_url: sourceUrl,
      checked_at: checkedAt,
      status,
      fallback_used: fallbackUsed,
      is_primary_source: sourceUrl ? sourceUrl.includes('univercell.ai') : null,
    })
  } catch (error) {
    console.error('Universal scraper health error:', error)
    return NextResponse.json({ error: 'Failed to fetch scraper health' }, { status: 500 })
  }
}
