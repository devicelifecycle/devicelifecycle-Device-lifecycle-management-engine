// ============================================================================
// CPO IMEI INTAKE — pure parsing/dedup helpers
// ============================================================================
// Shared by the intake page (parses pasted/uploaded text) and the API route
// (drops duplicates within one upload before they hit the database).

export interface ImeiIntakeRow {
  imei: string
  serial_number?: string
}

/**
 * Parse "one device per line" text into intake rows. Each line is either a
 * bare IMEI or "IMEI, serial". Blank lines and lines with a too-short IMEI
 * are dropped rather than rejected, since pasted vendor sheets are messy.
 */
export function parseImeiRows(text: string): ImeiIntakeRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const [imeiPart, serialPart] = line.split(',').map((p) => p.trim())
      return { imei: (imeiPart || '').replace(/\s+/g, ''), serial_number: serialPart || undefined }
    })
    .filter((row) => row.imei.length >= 4)
}

/** Drop rows whose IMEI repeats earlier in the same batch, keeping the first occurrence. */
export function dedupeImeiRows<T extends { imei: string }>(rows: T[]): T[] {
  const seen = new Set<string>()
  return rows.filter((row) => {
    if (seen.has(row.imei)) return false
    seen.add(row.imei)
    return true
  })
}
