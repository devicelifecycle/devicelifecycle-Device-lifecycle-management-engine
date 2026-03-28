#!/usr/bin/env npx tsx
import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(process.cwd(), '.env.local'), override: true })
config({ path: resolve(process.cwd(), '.env'), override: false })

async function main() {
  const { PricingTrainingService } = await import('../src/services/pricing-training.service')
  const { createServiceRoleClient } = await import('../src/lib/supabase/service-role')

  const supabase = createServiceRoleClient()
  const now = new Date().toISOString()

  console.log('\nBootstrapping pricing model baselines...')
  console.log(`Time: ${now}`)

  const result = await PricingTrainingService.train()

  console.log(`Baselines upserted: ${result.baselines_upserted}`)
  console.log(`Condition multipliers updated: ${result.condition_multipliers_updated}`)
  console.log(`Sample counts: ${JSON.stringify(result.sample_counts)}`)
  if (result.errors.length > 0) {
    console.log('Training errors:')
    for (const error of result.errors.slice(0, 20)) {
      console.log(`- ${error}`)
    }
  }

  const { count: baselineCount, error: baselineCountError } = await supabase
    .from('trained_pricing_baselines')
    .select('*', { count: 'exact', head: true })

  if (baselineCountError) {
    throw new Error(`Failed to count trained baselines: ${baselineCountError.message}`)
  }

  const { count: multiplierCount, error: multiplierCountError } = await supabase
    .from('trained_condition_multipliers')
    .select('*', { count: 'exact', head: true })

  if (multiplierCountError) {
    throw new Error(`Failed to count trained condition multipliers: ${multiplierCountError.message}`)
  }

  console.log(`Persisted trained baselines: ${baselineCount ?? 0}`)
  console.log(`Persisted condition multipliers: ${multiplierCount ?? 0}`)

  if ((baselineCount ?? 0) > 0) {
    const settingsRows = [
      {
        setting_key: 'prefer_data_driven',
        setting_value: 'true',
        description: 'Use the data-driven pricing model by default when trained baselines exist',
      },
      {
        setting_key: 'last_pricing_bootstrap_at',
        setting_value: now,
        description: 'Last time pricing baselines were bootstrapped',
      },
      {
        setting_key: 'last_pricing_bootstrap_baseline_count',
        setting_value: String(baselineCount ?? 0),
        description: 'Number of trained pricing baselines after bootstrap',
      },
    ]

    const { error: settingsError } = await supabase
      .from('pricing_settings')
      .upsert(settingsRows, { onConflict: 'setting_key' })

    if (settingsError) {
      throw new Error(`Failed to update pricing settings: ${settingsError.message}`)
    }

    console.log('Enabled prefer_data_driven=true in pricing_settings.')
  } else {
    throw new Error('Bootstrap completed without creating trained baselines.')
  }

  console.log('\nPricing model bootstrap complete.\n')
}

main().catch((error) => {
  console.error('Pricing model bootstrap failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
