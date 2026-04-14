// ============================================================================
// DEVICE MATCHING UTILITY
// Flexible matching for CSV make/model to device catalog (handles spelling, aliases, storage)
// ============================================================================

import type { Device } from '@/types'

/** Make aliases: CSV value -> catalog make */
const MAKE_ALIASES: Record<string, string> = {
  iphone: 'apple',
  apple: 'apple',
  samsung: 'samsung',
  galaxy: 'samsung',
  google: 'google',
  pixel: 'google',
  oneplus: 'oneplus',
  motorola: 'motorola',
  moto: 'motorola',
  lg: 'lg',
  sony: 'sony',
  xiaomi: 'xiaomi',
  huawei: 'huawei',
  oppo: 'oppo',
  vivo: 'vivo',
  nokia: 'nokia',
  microsoft: 'microsoft',
  surface: 'microsoft',
  lenovo: 'lenovo',
  thinkpad: 'lenovo',
  dell: 'dell',
  hp: 'hp',
  asus: 'asus',
}

/** Normalize string for matching: trim, lowercase, collapse spaces */
function normalize(s: string | undefined | null): string {
  if (s == null || typeof s !== 'string') return ''
  return s
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/** Strip storage from model string (e.g. "iPhone 15 Pro 256GB" -> "iPhone 15 Pro") */
function stripStorage(model: string): string {
  return model
    .replace(/\s*(128|256|512|64|32|16)\s*gb\s*/gi, '')
    .replace(/\s*(1|2|4|8)\s*tb\s*/gi, '')
    .trim()
}

/** Known brand prefixes for splitting "Samsung Galaxy S24" -> make=Samsung, model=Galaxy S24 */
const BRAND_PREFIXES = ['samsung', 'apple', 'google', 'oneplus', 'motorola', 'moto', 'lg', 'sony',
  'xiaomi', 'huawei', 'oppo', 'vivo', 'nokia', 'microsoft', 'lenovo', 'dell', 'hp', 'asus']

/** Split "Samsung Galaxy S24" into make + model when full name is in one column */
function splitMakeModel(full: string): { make: string; model: string } | null {
  const n = normalize(full)
  if (!n) return null
  for (const brand of BRAND_PREFIXES) {
    if (n.startsWith(brand + ' ')) {
      const rest = n.slice(brand.length).trim()
      if (rest) return { make: brand, model: rest }
    }
  }
  if (n.startsWith('iphone ') || n.startsWith('pixel ')) {
    const make = n.startsWith('iphone ') ? 'apple' : 'google'
    const model = n.replace(/^(iphone|pixel)\s+/i, '').trim()
    if (model) return { make, model }
  }
  return null
}

/** Resolve make: use alias if CSV has "iPhone", "Pixel", etc. */
function resolveMake(csvMake: string): string {
  const n = normalize(csvMake)
  if (!n) return ''
  return MAKE_ALIASES[n] ?? n
}

/**
 * Normalize Apple model strings so templates that omit "iPhone" still match.
 *
 * Handles:
 *  - "11", "12", "13" → "iphone 11" / "iphone 12" / "iphone 13"
 *  - "14 Pro", "13 Pro Max" → "iphone 14 pro" / "iphone 13 pro max"
 *  - "SE2", "SE 2", "SE2nd" → "iphone se (2nd gen)"
 *  - "SE3", "SE 3" → "iphone se (3rd gen)"
 *  - "X", "XR", "XS", "XS Max" → kept as is (already match catalog)
 *  - "12 mini", "13 mini" → "iphone 12 mini" / "iphone 13 mini"
 *  - Models that already start with "iphone" → unchanged
 */
function normalizeAppleModel(model: string): string {
  const m = model.toLowerCase().trim()
  if (!m) return model

  // Already starts with iphone, ipad, macbook, imac, airpods, mac → leave alone
  if (/^(iphone|ipad|macbook|imac|airpods|mac\s|apple\s*watch)/.test(m)) return m

  // SE2 / SE 2 / SE2nd → iphone se (2nd gen)
  if (/^se\s*2/i.test(m)) return 'iphone se (2nd gen)'
  // SE3 / SE 3 → iphone se (3rd gen)
  if (/^se\s*3/i.test(m)) return 'iphone se (3rd gen)'

  // Pure number OR number followed by pro/max/plus/mini/ultra/fe/se variants
  // e.g. "11", "12 Pro", "13 Pro Max", "14 Plus", "15 Pro Max"
  if (/^\d+(\s+(pro\s+max|pro|plus|mini|ultra|max))?$/i.test(m)) {
    return `iphone ${m}`
  }

  return model
}

/**
 * Generate candidate model strings for matching — tries the original plus common
 * catalog naming variants (e.g. "Pro Max" ↔ "Pro Max", Gen suffix variants).
 */
function modelCandidates(rawModel: string, make: string): string[] {
  const base = normalize(stripStorage(rawModel))
  const candidates = new Set<string>([base])

  // For Apple, also try the iPhone-prefixed version
  if (make === 'apple') {
    const normalized = normalizeAppleModel(base)
    candidates.add(normalized)
    candidates.add(normalize(stripStorage(normalized)))

    // "iphone se (2nd generation)" ↔ "iphone se (2nd gen)"
    candidates.add(base.replace(/\(2nd gen\)/, '(2nd generation)').replace(/\(3rd gen\)/, '(3rd generation)'))
    candidates.add(base.replace(/\(2nd generation\)/, '(2nd gen)').replace(/\(3rd generation\)/, '(3rd gen)'))
    // "iphone 12 pro max" ↔ "iphone 12 pro max" (already there)
    // "14 pro max" → also try "iphone 14 pro max"
    if (!base.startsWith('iphone')) {
      candidates.add(`iphone ${base}`)
    }
  }

  // Samsung: "galaxy s24" ↔ "galaxy s24" — try with/without "galaxy" prefix
  if (make === 'samsung') {
    if (!base.startsWith('galaxy')) candidates.add(`galaxy ${base}`)
    else candidates.add(base.replace(/^galaxy\s+/, ''))
  }

  // Google: "pixel 9" ↔ "pixel 9"
  if (make === 'google') {
    if (!base.startsWith('pixel')) candidates.add(`pixel ${base}`)
    else candidates.add(base.replace(/^pixel\s+/, ''))
  }

  return Array.from(candidates).filter(Boolean)
}

/**
 * Find a device in the catalog that matches the CSV row's make/model.
 * Handles: aliases (iPhone->Apple), storage in model, extra spaces, case.
 * Also handles "Samsung Galaxy S24" in make column with empty model.
 * Handles iPhone number-only models like "11", "12", "14 Pro Max".
 */
export function matchDeviceFromCsv(
  devices: Device[],
  deviceMake: string | undefined | null,
  deviceModel: string | undefined | null
): Device | undefined {
  let csvMake = resolveMake(deviceMake ?? '')
  let csvModelRaw = normalize(stripStorage(deviceModel ?? ''))

  // When make has full name "Samsung Galaxy S24" and model is empty, split it
  if (!csvModelRaw && csvMake) {
    const combined = `${deviceMake ?? ''} ${deviceModel ?? ''}`.trim()
    const split = splitMakeModel(combined)
    if (split) {
      csvMake = split.make
      csvModelRaw = normalize(stripStorage(split.model))
    }
  }
  // When model has full name "Samsung Galaxy S24" and make is empty, split it
  if (!csvMake && csvModelRaw) {
    const split = splitMakeModel(deviceModel ?? '')
    if (split) {
      csvMake = split.make
      csvModelRaw = normalize(stripStorage(split.model))
    }
  }

  // When make is empty and model is a pure number (7-16) → assume iPhone
  if (!csvMake && /^\d+(\s+(pro\s+max|pro|plus|mini|ultra|max))?$/i.test(csvModelRaw)) {
    csvMake = 'apple'
  }

  if (!csvMake || !csvModelRaw) return undefined

  const candidates = modelCandidates(csvModelRaw, csvMake)

  // 1. Exact make + exact model match (try all candidates)
  for (const candidate of candidates) {
    const match = devices.find(
      (d) => normalize(d.make) === csvMake && normalize(d.model) === candidate
    )
    if (match) return match
  }

  // 2. Exact make + catalog model after stripping storage
  for (const candidate of candidates) {
    const match = devices.find(
      (d) =>
        normalize(d.make) === csvMake &&
        normalize(stripStorage(d.model)) === candidate
    )
    if (match) return match
  }

  // 3. Prefix match: catalog model starts with CSV model (for "iPhone 15 Pro" matching "iPhone 15 Pro")
  //    Be conservative: only allow if catalog model starts with CSV candidate + space
  for (const candidate of candidates) {
    const match = devices.find((d) => {
      if (normalize(d.make) !== csvMake) return false
      const dModel = normalize(d.model)
      if (dModel === candidate) return true
      if (dModel.startsWith(candidate + ' ')) return true
      return false
    })
    if (match) return match
  }

  return undefined
}
