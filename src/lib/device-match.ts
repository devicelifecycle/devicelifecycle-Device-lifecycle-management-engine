// ============================================================================
// DEVICE MATCHING UTILITY
// Flexible matching for CSV make/model to device catalog (handles spelling, aliases, storage)
// ============================================================================

import type { Device } from '@/types'
import { DEVICE_BRANDS } from '@/lib/constants'

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

/** Normalize string for matching: trim, lowercase, collapse spaces, expand '+' suffix */
function normalize(s: string | undefined | null): string {
  if (s == null || typeof s !== 'string') return ''
  return s
    .toLowerCase()
    .trim()
    .replace(/\+/g, ' plus ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Strip storage from model string (e.g. "iPhone 15 Pro 256GB" -> "iPhone 15 Pro") */
function stripStorage(model: string): string {
  return model
    .replace(/\s*(128|256|512|64|32|16)\s*gb\s*/gi, '')
    .replace(/\s*(1|2|4|8)\s*tb\s*/gi, '')
    .trim()
}

// Known color names/phrases, longest-first so e.g. "Space Gray" matches
// before the bare "Gray" inside it would. Covers plain colors plus the
// common two-word marketing names (Apple/Samsung/Google). Deliberately
// does NOT attempt abbreviated codes (BK, BLK, GRY) or slash-separated
// multi-color lists ("BK/GR/VT") — that's a separate, harder problem.
const COLOR_PHRASES = [
  'natural titanium', 'titanium black', 'titanium gray', 'titanium grey', 'titanium blue', 'titanium violet', 'titanium yellow', 'titanium silver',
  'space gray', 'space grey', 'space black', 'phantom black', 'phantom white', 'phantom violet', 'phantom green', 'phantom silver',
  'sierra blue', 'alpine green', 'deep purple', 'pacific blue', 'product red', 'midnight green', 'graphite gray',
  'rose gold', 'jet black',
  'black', 'white', 'blue', 'red', 'green', 'gold', 'silver', 'gray', 'grey', 'purple', 'violet',
  'pink', 'yellow', 'orange', 'coral', 'lavender', 'mint', 'cream', 'bronze', 'copper',
  'graphite', 'obsidian', 'midnight', 'starlight', 'titanium', 'charcoal', 'navy', 'teal', 'beige',
].sort((a, b) => b.length - a.length)

const COLOR_PATTERN = new RegExp(`\\b(${COLOR_PHRASES.map((c) => c.replace(/ /g, '\\s+')).join('|')})\\b`, 'i')

/** Pull a trailing color name out of a model string, if present. */
export function extractColor(model: string): string | undefined {
  const match = normalize(model).match(COLOR_PATTERN)
  if (!match) return undefined
  // Title-case each word: "space gray" -> "Space Gray"
  return match[1].split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

/** Strip a known trailing color name from a model string (e.g. "S24 Black" -> "S24") */
export function stripColor(model: string): string {
  return model.replace(COLOR_PATTERN, '').replace(/\s+/g, ' ').trim()
}

/**
 * Remove common trailing noise tokens from free-typed model values.
 * Example: "iphone 14 s" -> "iphone 14".
 */
function sanitizeModelNoise(model: string): string {
  const n = normalize(model)
  if (!n) return ''

  // If the model ends with a standalone trailing "s" after a number,
  // treat it as typo/noise rather than a real variant suffix.
  if (/\b\d+\s+s$/i.test(n)) {
    return n.replace(/\s+s$/i, '').trim()
  }

  return n
}

/** Known brand prefixes for splitting "Samsung Galaxy S24" -> make=Samsung, model=Galaxy S24 */
const BRAND_PREFIXES = ['samsung', 'galaxy', 'apple', 'google', 'pixel', 'oneplus', 'motorola', 'moto', 'lg', 'sony', 'sonim',
  'xiaomi', 'huawei', 'oppo', 'vivo', 'nokia', 'microsoft', 'surface', 'lenovo', 'thinkpad', 'dell', 'hp', 'asus']

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

const KNOWN_BRANDS = new Set([
  ...DEVICE_BRANDS.map((b) => b.toLowerCase()),
  ...Object.values(MAKE_ALIASES),
])

/**
 * Reject make values that aren't actually a brand — IMEIs/serials
 * ("89302720523083259790") or part numbers ("653957-001", "832414-B21")
 * ending up in a CSV's brand column. Used to stop the auto-add-to-catalog
 * fallback from polluting device_catalog with garbage make values; the
 * row instead stays "not in catalog" for manual review.
 */
export function isPlausibleBrand(make: string | undefined | null): boolean {
  const n = normalize(make ?? '')
  if (!n) return false
  if (KNOWN_BRANDS.has(resolveMake(n))) return true

  const alnum = n.replace(/[^a-z0-9]/gi, '')
  const digitCount = (alnum.match(/\d/g) || []).length
  // Mostly-digit strings (IMEIs, serials, asset tags) are never a brand name
  if (digitCount >= 4 && digitCount >= alnum.length * 0.5) return false
  // A real brand has at least one recognizable alphabetic word
  if (!/[a-z]{3,}/i.test(n)) return false

  return true
}

/**
 * If a model string redundantly includes the make prefix
 * (e.g. make=apple, model="apple iphone 15"), strip the make so
 * model matching can align with catalog entries.
 */
function stripLeadingMakePrefix(make: string, model: string): string {
  if (!make || !model) return model
  const makeToken = normalize(make)
  const modelToken = normalize(model)

  if (modelToken.startsWith(makeToken + ' ')) {
    return modelToken.slice(makeToken.length).trim()
  }

  return modelToken
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
  const base = normalize(stripColor(stripStorage(rawModel)))
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
  let csvModelRaw = sanitizeModelNoise(stripColor(stripStorage(deviceModel ?? '')))

  // When make has full name "Samsung Galaxy S24" and model is empty, split it
  if (!csvModelRaw && csvMake) {
    const combined = `${deviceMake ?? ''} ${deviceModel ?? ''}`.trim()
    const split = splitMakeModel(combined)
    if (split) {
      csvMake = split.make
      csvModelRaw = sanitizeModelNoise(stripColor(stripStorage(split.model)))
    }
  }
  // When model has full name "Samsung Galaxy S24" and make is empty, split it
  if (!csvMake && csvModelRaw) {
    const split = splitMakeModel(deviceModel ?? '')
    if (split) {
      // Apply MAKE_ALIASES so "galaxy" → "samsung", "pixel" → "google", etc.
      csvMake = resolveMake(split.make)
      csvModelRaw = sanitizeModelNoise(stripColor(stripStorage(split.model)))
    }
  }

  // When make is empty and model is a pure number (7-16) → assume iPhone
  if (!csvMake && /^\d+(\s+(pro\s+max|pro|plus|mini|ultra|max))?$/i.test(csvModelRaw)) {
    csvMake = 'apple'
  }

  // Some templates include make twice across columns, e.g.
  // make="apple", model="apple iphone 15".
  csvModelRaw = stripLeadingMakePrefix(csvMake, csvModelRaw)

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

  // 4. Word-boundary keyword match: CSV model token appears as a whole word inside catalog model.
  //    Enables "S23" to match "Galaxy S23", "S23 Ultra" etc. when make is resolved to "samsung".
  //    Prefers shortest matching model name (most specific match) to avoid false positives.
  const keywordMatches: Device[] = []
  for (const candidate of candidates) {
    // Build a word-boundary regex: \bcandidate\b
    const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const re = new RegExp(`\\b${escaped}\\b`)
    const matching = devices.filter((d) => {
      if (normalize(d.make) !== csvMake) return false
      return re.test(normalize(d.model))
    })
    keywordMatches.push(...matching)
  }
  if (keywordMatches.length > 0) {
    // Pick the device whose model name is shortest (most specific / fewest extra tokens)
    keywordMatches.sort((a, b) => normalize(a.model).length - normalize(b.model).length)
    return keywordMatches[0]
  }

  return undefined
}
