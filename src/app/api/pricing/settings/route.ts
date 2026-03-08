// ============================================================================
// PRICING SETTINGS API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { PricingSettingsOverrides } from '@/services/pricing.service'

const SETTING_KEYS: (keyof PricingSettingsOverrides)[] = [
  'channel_green_min', 'channel_yellow_min', 'marketplace_fee_percent',
  'breakage_risk_percent', 'competitive_relevance_min', 'competitor_ceiling_percent', 'outlier_deviation_threshold',
  'trade_in_profit_percent', 'enterprise_margin_percent',
  'cpo_markup_percent', 'cpo_enterprise_markup_percent', 'price_staleness_days',
  'margin_mode', 'custom_margin_percent', 'custom_margin_amount',
  'prefer_data_driven',
]

const SETTING_BOUNDS: Record<string, { min: number; max: number }> = {
  channel_green_min: { min: 0, max: 100 },
  channel_yellow_min: { min: 0, max: 100 },
  marketplace_fee_percent: { min: 0, max: 100 },
  breakage_risk_percent: { min: 0, max: 100 },
  competitive_relevance_min: { min: 0, max: 100 },
  competitor_ceiling_percent: { min: 0, max: 100 },
  outlier_deviation_threshold: { min: 0, max: 200 },
  trade_in_profit_percent: { min: 0, max: 100 },
  enterprise_margin_percent: { min: 0, max: 100 },
  cpo_markup_percent: { min: 0, max: 100 },
  cpo_enterprise_markup_percent: { min: 0, max: 100 },
  price_staleness_days: { min: 0, max: 365 },
  custom_margin_percent: { min: 0, max: 100 },
  custom_margin_amount: { min: 0, max: 100000 },
}

export async function GET() {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (profile && ['customer', 'vendor'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data } = await supabase
      .from('pricing_settings')
      .select('setting_key, setting_value')
    if (!data) return NextResponse.json({ data: {} })

    const settings: Record<string, string> = {}
    for (const row of data) {
      settings[row.setting_key] = row.setting_value
    }
    return NextResponse.json({ data: settings })
  } catch (error) {
    console.error('Error fetching pricing settings:', error)
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (!profile || !['admin', 'coe_manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const updates = Object.entries(body).filter(([k]) => SETTING_KEYS.includes(k as keyof PricingSettingsOverrides))
    if (updates.length === 0) {
      return NextResponse.json({ error: 'No valid settings to update' }, { status: 400 })
    }

    for (const [key, value] of updates) {
      let strVal: string
      if (key === 'prefer_data_driven') {
        strVal = value === true || value === 'true' || value === '1' ? 'true' : 'false'
      } else if (key === 'margin_mode') {
        strVal = value === 'custom' ? 'custom' : 'auto'
      } else {
        strVal = String(value)
        const num = parseFloat(strVal)
        if (strVal === '' || Number.isNaN(num)) continue
        const bounds = SETTING_BOUNDS[key]
        if (bounds && (num < bounds.min || num > bounds.max)) {
          return NextResponse.json(
            { error: `Invalid value for ${key}: must be between ${bounds.min} and ${bounds.max}` },
            { status: 400 }
          )
        }
        if (num < 0) continue
      }
      await supabase
        .from('pricing_settings')
        .upsert({ setting_key: key, setting_value: strVal }, { onConflict: 'setting_key' })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating pricing settings:', error)
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 })
  }
}
