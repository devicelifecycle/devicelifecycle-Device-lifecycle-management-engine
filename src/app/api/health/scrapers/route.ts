import { NextResponse } from 'next/server'
import { SCRAPER_PROVIDERS, getProviderSettingsKeys } from '@/lib/scrapers/rollout-metadata'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, profile } = auth

    if (!['admin', 'coe_manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const keys = [
      'last_scraper_rollout_at',
      'last_scraper_rollout_partial_failure',
      'last_universal_source_url',
      'last_universal_source_at',
      'last_universal_source_status',
      'last_universal_source_fallback_used',
      ...SCRAPER_PROVIDERS.flatMap((provider) => getProviderSettingsKeys(provider.settingsPrefix)),
    ]

    const { data, error } = await supabase
      .from('pricing_settings')
      .select('setting_key, setting_value')
      .in('setting_key', keys)

    if (error) {
      return NextResponse.json({ error: 'Failed to fetch scraper health settings' }, { status: 500 })
    }

    const settings = Object.fromEntries((data || []).map((row: { setting_key: string; setting_value: string }) => [row.setting_key, row.setting_value]))
    const providers = SCRAPER_PROVIDERS.map((provider) => {
      const prefix = provider.settingsPrefix
      return {
        id: provider.id,
        name: provider.name,
        status: settings[`last_${prefix}_scraper_status`] || 'unknown',
        count: Number(settings[`last_${prefix}_scraper_count`] || 0),
        duration_ms: Number(settings[`last_${prefix}_scraper_duration_ms`] || 0),
        checked_at: settings[`last_${prefix}_scraper_at`] || null,
        configured_impl: settings[`last_${prefix}_scraper_configured_impl`] || 'ts',
        persisted_impl: settings[`last_${prefix}_scraper_persisted_impl`] || 'ts',
        error: settings[`last_${prefix}_scraper_error`] || null,
      }
    })

    return NextResponse.json({
      success: true,
      checked_at: settings.last_scraper_rollout_at || null,
      partial_failure: settings.last_scraper_rollout_partial_failure === 'true',
      providers,
      universal_source: {
        source_url: settings.last_universal_source_url || null,
        checked_at: settings.last_universal_source_at || null,
        status: settings.last_universal_source_status || 'unknown',
        fallback_used: settings.last_universal_source_fallback_used === 'true',
      },
    })
  } catch (error) {
    console.error('Scraper rollout health error:', error)
    return NextResponse.json({ error: 'Failed to fetch scraper rollout health' }, { status: 500 })
  }
}
