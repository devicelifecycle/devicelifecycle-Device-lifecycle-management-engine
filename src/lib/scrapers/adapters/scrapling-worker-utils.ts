export function redactWorkerLogs(raw: string): string {
  if (!raw) return ''

  return raw
    .replace(/(authorization['"]?\s*[:=]\s*['"]?)(bearer\s+)?[a-z0-9._~+/-]+/gi, '$1[REDACTED]')
    .replace(/(cookie['"]?\s*[:=]\s*['"]?)[^'"\n]+/gi, '$1[REDACTED]')
    .replace(/(set-cookie['"]?\s*[:=]\s*['"]?)[^'"\n]+/gi, '$1[REDACTED]')
    .replace(/(x-api-key['"]?\s*[:=]\s*['"]?)[^'"\n]+/gi, '$1[REDACTED]')
    .replace(/(access[_-]?token['"]?\s*[:=]\s*['"]?)[^'"\n]+/gi, '$1[REDACTED]')
    .replace(/(refresh[_-]?token['"]?\s*[:=]\s*['"]?)[^'"\n]+/gi, '$1[REDACTED]')
    .replace(/\b(supabase_service_role_key|service_role_key)\b[^ \n]*/gi, '[REDACTED_KEY]')
    .trim()
}
