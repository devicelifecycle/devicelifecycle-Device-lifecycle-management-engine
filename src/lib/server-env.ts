// ============================================================================
// SERVER ENV HELPERS
// ============================================================================

export function readServerEnv(name: string): string | undefined {
  const value = process.env[name]
  if (typeof value !== 'string') return undefined

  const normalized = value.trim()
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
