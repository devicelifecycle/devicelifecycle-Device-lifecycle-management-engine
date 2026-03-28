#!/usr/bin/env npx tsx
import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

const cwd = process.cwd()
const envLocalPath = path.join(cwd, '.env.local')

if (fs.existsSync(envLocalPath)) {
  dotenv.config({ path: envLocalPath, override: false })
}

type Check = {
  area: 'repo' | 'env' | 'db' | 'external'
  label: string
  pass: boolean
  blocking: boolean
  note?: string
}

function hasFile(relativePath: string): boolean {
  return fs.existsSync(path.join(cwd, relativePath))
}

function hasEnv(name: string): boolean {
  return typeof process.env[name] === 'string' && process.env[name]!.trim().length > 0
}

function envEquals(name: string, value: string): boolean {
  return (process.env[name] || '').trim() === value
}

const checks: Check[] = [
  {
    area: 'repo',
    label: 'Security review doc exists',
    pass: hasFile('docs/SCRAPLING_SECURITY_REVIEW.md'),
    blocking: true,
  },
  {
    area: 'repo',
    label: 'Rollout doc exists',
    pass: hasFile('docs/SCRAPLING_ROLLOUT.md'),
    blocking: true,
  },
  {
    area: 'repo',
    label: 'Checklist audit doc exists',
    pass: hasFile('docs/SCRAPLING_CHECKLIST_AUDIT.md'),
    blocking: true,
  },
  {
    area: 'repo',
    label: 'Aggregate scraper health API exists',
    pass: hasFile('src/app/api/health/scrapers/route.ts'),
    blocking: true,
  },
  {
    area: 'repo',
    label: 'Rollout validation script exists',
    pass: hasFile('scripts/validate-scrapling-rollout.ts'),
    blocking: true,
  },
  {
    area: 'repo',
    label: 'Dual burn-in script exists',
    pass: hasFile('scripts/burnin-scrapling-dual.ts'),
    blocking: true,
  },
  {
    area: 'repo',
    label: 'All Scrapling workers exist',
    pass: [
      'scrapers_py/apple_worker.py',
      'scrapers_py/bell_worker.py',
      'scrapers_py/gorecell_worker.py',
      'scrapers_py/telus_worker.py',
      'scrapers_py/univercell_worker.py',
    ].every(hasFile),
    blocking: true,
  },
  {
    area: 'env',
    label: 'Supabase URL configured',
    pass: hasEnv('NEXT_PUBLIC_SUPABASE_URL') || hasEnv('SUPABASE_URL'),
    blocking: true,
  },
  {
    area: 'env',
    label: 'Supabase anon key configured',
    pass: hasEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY') || hasEnv('SUPABASE_ANON_KEY'),
    blocking: true,
  },
  {
    area: 'env',
    label: 'Supabase service role key configured',
    pass: hasEnv('SUPABASE_SERVICE_ROLE_KEY'),
    blocking: true,
  },
  {
    area: 'env',
    label: 'App base URL configured',
    pass: hasEnv('NEXT_PUBLIC_APP_URL') || hasEnv('VERCEL_PROJECT_PRODUCTION_URL') || hasEnv('VERCEL_URL'),
    blocking: true,
    note: 'NEXT_PUBLIC_APP_URL is recommended locally. On Vercel, deployment URLs can be inferred automatically.',
  },
  {
    area: 'env',
    label: 'Price scraper cron secret configured',
    pass: hasEnv('CRON_SECRET'),
    blocking: true,
  },
  {
    area: 'env',
    label: 'Price scraper enabled',
    pass: envEquals('PRICE_SCRAPER_ENABLED', 'true'),
    blocking: true,
    note: 'Set PRICE_SCRAPER_ENABLED=true before launch if live scraping should run.',
  },
  {
    area: 'env',
    label: 'Stallion API token configured',
    pass: hasEnv('STALLION_API_TOKEN'),
    blocking: true,
    note: 'Required for live shipment label purchase.',
  },
  {
    area: 'env',
    label: 'Stallion API base URL configured',
    pass: hasEnv('STALLION_API_BASE_URL'),
    blocking: false,
    note: 'Defaults to production if omitted, but explicit config is safer.',
  },
  {
    area: 'env',
    label: 'Stallion store ID configured',
    pass: hasEnv('STALLION_STORE_ID'),
    blocking: false,
    note: 'Only needed if your Stallion account requires a store_id.',
  },
  {
    area: 'external',
    label: 'Hosted staging/prod env vars applied',
    pass: false,
    blocking: true,
    note: 'Cannot be verified from this local workspace.',
  },
  {
    area: 'external',
    label: 'Hosted deployment completed',
    pass: false,
    blocking: true,
    note: 'Cannot be verified from this local workspace.',
  },
  {
    area: 'external',
    label: 'Hosted log monitoring completed during burn-in',
    pass: false,
    blocking: true,
    note: 'Cannot be verified from this local workspace.',
  },
]

async function loadDbChecks(): Promise<Check[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    return [
      {
        area: 'db',
        label: 'Supabase-backed launch checks',
        pass: false,
        blocking: true,
        note: 'Missing Supabase URL or service role key, so DB launch state cannot be verified.',
      },
    ]
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const [
    { count: competitorCount, error: competitorError },
    { count: baselineCount, error: baselineError },
    { data: pricingSettings, error: settingsError },
  ] = await Promise.all([
    supabase.from('competitor_prices').select('*', { count: 'exact', head: true }),
    supabase.from('trained_pricing_baselines').select('*', { count: 'exact', head: true }),
    supabase
      .from('pricing_settings')
      .select('setting_key, setting_value')
      .in('setting_key', ['prefer_data_driven', 'last_pricing_bootstrap_baseline_count']),
  ])

  const settingsMap = Object.fromEntries((pricingSettings || []).map((row) => [row.setting_key, row.setting_value]))

  return [
    {
      area: 'db',
      label: 'Competitor prices populated',
      pass: !competitorError && (competitorCount ?? 0) > 0,
      blocking: true,
      note: competitorError ? competitorError.message : `Found ${competitorCount ?? 0} competitor price rows.`,
    },
    {
      area: 'db',
      label: 'Trained pricing baselines populated',
      pass: !baselineError && (baselineCount ?? 0) > 0,
      blocking: true,
      note: baselineError ? baselineError.message : `Found ${baselineCount ?? 0} trained baseline rows.`,
    },
    {
      area: 'db',
      label: 'Data-driven pricing is enabled by default',
      pass: !settingsError && settingsMap.prefer_data_driven === 'true',
      blocking: true,
      note: settingsError
        ? settingsError.message
        : `prefer_data_driven=${settingsMap.prefer_data_driven ?? 'missing'}, bootstrap_baselines=${settingsMap.last_pricing_bootstrap_baseline_count ?? 'missing'}`,
    },
  ]
}

function summarize(area: Check['area']) {
  const scoped = checks.filter((check) => check.area === area)
  const passed = scoped.filter((check) => check.pass).length
  return { total: scoped.length, passed, failed: scoped.length - passed }
}

function printSection(title: string, items: Check[]) {
  console.log(`\n${title}`)
  for (const item of items) {
    const prefix = item.pass ? '[pass]' : item.blocking ? '[fail]' : '[warn]'
    console.log(`${prefix} ${item.label}`)
    if (item.note && !item.pass) {
      console.log(`       ${item.note}`)
    }
  }
}

async function main() {
  checks.push(...await loadDbChecks())

  const repo = summarize('repo')
  const env = summarize('env')
  const db = summarize('db')
  const external = summarize('external')

  printSection('Repo Checks', checks.filter((check) => check.area === 'repo'))
  printSection('Environment Checks', checks.filter((check) => check.area === 'env'))
  printSection('Database Checks', checks.filter((check) => check.area === 'db'))
  printSection('External Checks', checks.filter((check) => check.area === 'external'))

  console.log('\nSummary')
  console.log(`repo: ${repo.passed}/${repo.total}`)
  console.log(`env: ${env.passed}/${env.total}`)
  console.log(`db: ${db.passed}/${db.total}`)
  console.log(`external: ${external.passed}/${external.total}`)

  const blockingFailures = checks.filter((check) => check.blocking && !check.pass)

  if (blockingFailures.length > 0) {
    console.error('\nLaunch readiness is not complete.')
    process.exit(1)
  }

  console.log('\nLaunch readiness checks passed.')
}

main().catch((error) => {
  console.error('Launch readiness check failed:', error instanceof Error ? error.message : error)
  process.exit(1)
})
