#!/usr/bin/env node
/**
 * Set pricing defaults: beat_competitor_percent=0, competitor_ceiling_percent=0
 * Usage: node --env-file=.env.local scripts/set-pricing-defaults.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config({ path: '.env.local' })

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const supabase = createClient(url, key)

const settings = [
  { setting_key: 'beat_competitor_percent', setting_value: '0', description: 'Offer 0% above highest competitor by default so quotes stay market-aligned' },
  { setting_key: 'competitor_ceiling_percent', setting_value: '0', description: 'Clamp to the top competitor by default' },
]

for (const s of settings) {
  const { error } = await supabase.from('pricing_settings').upsert(s, { onConflict: 'setting_key' })
  if (error) {
    console.error(`Failed to set ${s.setting_key}:`, error.message)
    process.exit(1)
  }
  console.log(`Set ${s.setting_key} = ${s.setting_value}`)
}
console.log('Done.')
