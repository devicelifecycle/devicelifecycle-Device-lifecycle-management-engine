import { config as loadEnv } from 'dotenv'

const E2E_ENV_FILES = [
  '.env.test.local',
  '.env.e2e.local',
  '.env.local',
  '.env.development.local',
  '.env.production.local',
  '.env.test',
  '.env.development',
  '.env.production',
  '.env',
]

let loaded = false

export function loadE2EEnv() {
  if (loaded) return

  // Prefer the most local overrides first, but fall back to the linked
  // production-local file because this repo often keeps Supabase credentials
  // there for workflow verification.
  for (const path of E2E_ENV_FILES) {
    loadEnv({ path, override: false, quiet: true })
  }

  loaded = true
}
