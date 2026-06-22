// ============================================================================
// SERVER ENV HELPERS
// ============================================================================

export function readServerEnv(name: string): string | undefined {
  const value = process.env[name]
  if (typeof value !== 'string') return undefined

  // .trim() only strips real whitespace — it does NOT strip a literal
  // two-character "\n"/"\r"/"\t" sequence, which is what you get if a value
  // gets set via a script/CLI that writes an escaped string without
  // interpreting it. Found this exact artifact in local .env.local
  // (PRICE_SCRAPER_ENABLED="true\n") on 2026-06-22 — unconfirmed whether the
  // same thing exists on Vercel, but if it did, it would silently fail the
  // strict === 'true' check in readBooleanServerEnv with zero error output,
  // just a silently-skipped cron run. Cheap to guard against either way.
  const normalized = value.replace(/\\[nrt]$/g, '').trim()
  return normalized.length > 0 ? normalized : undefined
}

export function readServerEnvAny(names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = readServerEnv(name)
    if (value) return value
  }

  return undefined
}

export function readBooleanServerEnv(name: string, defaultValue = false): boolean {
  const value = readServerEnv(name)
  if (!value) return defaultValue

  const normalized = value.toLowerCase()
  if (normalized === 'true') return true
  if (normalized === 'false') return false

  return defaultValue
}
