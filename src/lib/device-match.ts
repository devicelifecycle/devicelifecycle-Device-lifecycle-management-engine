// ============================================================================
// DEVICE MATCHING UTILITY
// Flexible matching for CSV make/model to device catalog (handles spelling, aliases, storage)
// ============================================================================

import type { Device } from '@/types'
import { DEVICE_BRANDS } from '@/lib/constants'

/** Make aliases: CSV value -> catalog make. Exported for scripts/dedupe-device-catalog.ts, which resolves brand from embedded model text when the make column itself is wrong (e.g. make="Samsung", model="Google Pixel 7a"). */
export const MAKE_ALIASES: Record<string, string> = {
  iphone: 'apple',
  apple: 'apple',
  apl: 'apple',
  appl: 'apple',
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
export function normalize(s: string | undefined | null): string {
  if (s == null || typeof s !== 'string') return ''
  return s
    .toLowerCase()
    .trim()
    .replace(/\+/g, ' plus ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Aggressive normalization for fuzzy duplicate detection: strips ALL
 * punctuation/whitespace and treats "generation" same as "gen". Used both
 * by matchDeviceFromCsv's tier 4 (catch naming-convention drift at
 * upload/match time) and by scripts/dedupe-device-catalog.ts (retroactively
 * find existing duplicates across the whole catalog using the same rule).
 */
export function stripForFuzzyCompare(s: string): string {
  return s.replace(/generation/gi, 'gen').replace(/[^a-z0-9]/gi, '').toLowerCase()
}

/** Strip storage from model string (e.g. "iPhone 15 Pro 256GB" -> "iPhone 15 Pro") */
export function stripStorage(model: string): string {
  // Replace with a single space, not '' — '' eats the whitespace on BOTH
  // sides of the match, gluing the surrounding words together with no
  // separator at all ("XR 64GB Unlocked" -> "XRUnlocked", a single fused
  // token that then fails every matching tier). Collapsed back to one
  // space + trimmed at the end.
  let m = model
    .replace(/\s*(128|256|512|64|32|16)\s*gb\s*/gi, ' ')
    .replace(/\s*(1|2|4|8)\s*tb\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Bare trailing number, no GB/TB suffix (e.g. "iPhone XR 64"). Only strip
  // it as storage if what's left isn't just the bare brand/product-line
  // word on its own — otherwise "iPhone 16" misreads as "iPhone" + 16GB,
  // confusing a generation number for a storage size.
  const trailing = m.match(/^(.*\S)\s+(16|32|64|128|256|512|1024|2048)$/i)
  if (trailing) {
    const before = trailing[1].trim()
    const looksLikeBareBrandOnly = /^(iphone|galaxy|pixel)$/i.test(before)
    if (!looksLikeBareBrandOnly) m = before
  }

  return m
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

// Carrier-lock/condition words that show up baked into a model column on
// real trade-in spreadsheets ("IPHONE XR 64GB UNLOCKED") instead of their
// own column. None of these are ever part of a real device's identity, but
// left in they defeat every matching tier — none strip arbitrary trailing
// words — so the row falls through to "not_in_catalog" or, worse, the
// auto-add fallback creates a fresh duplicate catalog row with the noise
// baked into its name (computeDeviceIdentity didn't strip it either).
const NOISE_WORDS_PATTERN = /\b(unlocked|locked|refurbished|renewed|open\s*box)\b/gi

/**
 * Remove common trailing noise tokens from free-typed model values.
 * Example: "iphone 14 s" -> "iphone 14".
 */
export function sanitizeModelNoise(model: string): string {
  const n = normalize(model)
  if (!n) return ''

  let result = n

  // If the model ends with a standalone trailing "s" after a number,
  // treat it as typo/noise rather than a real variant suffix.
  if (/\b\d+\s+s$/i.test(result)) {
    result = result.replace(/\s+s$/i, '').trim()
  }

  result = normalize(result.replace(NOISE_WORDS_PATTERN, ''))

  return result
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
 * ("89302720523083259790"), part/SKU codes ("653957-001", "832414-B21",
 * "AL13SXB60ON") ending up in a CSV's brand column. Used to stop the
 * auto-add-to-catalog fallback from polluting device_catalog with garbage
 * make values; the row instead stays "not in catalog" for manual review.
 */
export function isPlausibleBrand(make: string | undefined | null): boolean {
  const n = normalize(make ?? '')
  if (!n) return false
  if (KNOWN_BRANDS.has(resolveMake(n))) return true

  // None of DEVICE_BRANDS/MAKE_ALIASES contain a digit — real brand names
  // never do. Part/SKU codes do ("AL13SXB60ON" has 3 consecutive letters,
  // which used to slip past a "mostly digits" check that only looked at
  // digit density, not presence). Any digit on an unrecognized string is
  // now an automatic reject.
  if (/\d/.test(n)) return false
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
export function normalizeAppleModel(model: string): string {
  const m = model.toLowerCase().trim()
  if (!m) return model

  // SE + generation ordinal, with or without a leading "iphone" and with or
  // without a trailing "gen"/"generation" word — "se 2", "se2nd", "iphone se
  // 2nd", "iphone se 2nd gen" all mean the same device. Checked before the
  // generic "starts with iphone" passthrough below, which would otherwise
  // return "iphone se 2nd" unchanged and never reach this normalization —
  // that gap let a fresh "iPhone SE 2nd" duplicate slip into the catalog.
  // The separator between "se" and the ordinal, and the word boundary after
  // "gen"/"generation", both tolerate an optional paren too — the catalog's
  // OWN canonical spelling is "iPhone SE (2nd generation)", which has a "("
  // directly after "se " and a ")" directly after "generation" with no
  // surrounding whitespace; a whitespace-only `\s*` can't cross either, so
  // the canonical string never normalized to match its own informal
  // variants ("SE2", "SE 2nd Gen") and split what should be one catalog
  // cluster into two.
  //
  // Each ordinal also accepts the spelled-out word ("second") and Apple's
  // real release year (SE 1st gen released 2016, 2nd gen 2020, 3rd gen
  // 2022) as equivalent labels — live data showed orders placed against
  // "iPhone SE 2020" / "iPhone SE first" while all pricing data lived under
  // "iPhone SE (2nd generation)" / "(1st generation)": same physical
  // device, parallel naming conventions from different catalog imports,
  // zero price visibility on the order side.
  const SE_GENERATIONS: Array<[RegExp, string]> = [
    [/(^|\s)se[\s(]*(1|1st|first|2016)(\s*gen(eration)?)?\)?(\s|$)/i, 'iphone se (1st gen)'],
    [/(^|\s)se[\s(]*(2|2nd|second|2020)(\s*gen(eration)?)?\)?(\s|$)/i, 'iphone se (2nd gen)'],
    [/(^|\s)se[\s(]*(3|3rd|third|2022)(\s*gen(eration)?)?\)?(\s|$)/i, 'iphone se (3rd gen)'],
    [/(^|\s)se[\s(]*(4|4th|fourth)(\s*gen(eration)?)?\)?(\s|$)/i, 'iphone se (4th gen)'],
  ]
  for (const [pattern, canonical] of SE_GENERATIONS) {
    if (pattern.test(m)) return canonical
  }

  // Already starts with iphone, ipad, macbook, imac, airpods, mac → leave alone
  if (/^(iphone|ipad|macbook|imac|airpods|mac\s|apple\s*watch)/.test(m)) return m

  // Pure number OR number followed by pro/max/plus/mini/ultra/fe/se variants
  // e.g. "11", "12 Pro", "13 Pro Max", "14 Plus", "15 Pro Max"
  if (/^\d+(\s+(pro\s+max|pro|plus|mini|ultra|max))?$/i.test(m)) {
    return `iphone ${m}`
  }

  return model
}

/**
 * If model text leads with a recognized brand word, that's a more
 * trustworthy signal than the make column — proven wrong on live data
 * (rows with make="Samsung", model="Google Pixel 7a 128GB", an upload
 * mistake that mistagged a real Google device as Samsung).
 */
function detectBrandFromModel(model: string | null | undefined): string | null {
  const m = normalize(model ?? '')
  for (const alias of Object.keys(MAKE_ALIASES)) {
    if (m === alias || m.startsWith(alias + ' ')) return MAKE_ALIASES[alias]
  }
  return null
}

/**
 * Strip leading brand alias words from already-normalized model text — in a
 * loop, not just once. "Apple iPhone SE 2022" stacks two alias words that
 * both resolve to "apple" ("apple" then "iphone"); a single-pass strip only
 * removes "apple ", leaving a residual "iphone " prefix that the bare
 * "iPhone SE 2022" catalog row never had — splitting one device into two
 * different fuzzy keys. Looping until no alias word matches closes that gap.
 */
function stripLeadingBrandWords(normalizedModel: string): string {
  let current = normalizedModel
  for (;;) {
    let matched = false
    for (const alias of Object.keys(MAKE_ALIASES)) {
      if (current === alias) return ''
      if (current.startsWith(alias + ' ')) {
        current = current.slice(alias.length + 1).trim()
        matched = true
        break
      }
    }
    if (!matched) return current
  }
}

function normalizeCategoryFamily(category: string | null | undefined): string {
  const c = normalize(category ?? '')
  if (c === 'phone' || c === 'smartphone') return 'phone'
  return c || 'unknown'
}

/**
 * The category column can be as unreliable as make (live proof: "Series SE
 * (1st Gen) (40MM)" — an Apple Watch — stored as category="phone"). Detected
 * from unmistakable watch-only signals in the model text itself: a
 * case-size token ("40mm", "44mm", ...) is never used by any phone/tablet/
 * laptop in this catalog.
 */
// Laptop/PC product-line names that are never used by any phone/tablet —
// catches the same "category column is wrong" pattern as the watch case
// below, found live: "Dell Latitude 5420"/"Precision 5560" rows existing
// with category="phone" on one row and category="laptop" on the other,
// splitting one real device into two fuzzy-match buckets purely because
// the dedup script (correctly) doesn't merge across different categories.
const LAPTOP_PRODUCT_LINES = /\b(latitude|precision|inspiron|xps|optiplex|thinkpad|thinkcentre|elitebook|probook|pavilion|surface\s*(laptop|book|pro)|macbook|chromebook|zbook)\b/i

function detectCategoryOverride(model: string | null | undefined): string | null {
  const m = normalize(model ?? '')
  if (/\b\d{2}\s*mm\b/.test(m) && /\bseries\b/.test(m)) return 'watch'
  if (/\bwatch\b/.test(m)) return 'watch'
  if (LAPTOP_PRODUCT_LINES.test(m)) return 'laptop'
  return null
}

/**
 * Single source of truth for "is this the same real device" across the
 * whole catalog, independent of which column (make, model, category)
 * happens to be wrong on a given row. Shared by scripts/dedupe-device-catalog.ts
 * (retroactive catalog-wide merge) and the CSV auto-add insert paths
 * (parse-trade-template, upload-csv), so a fresh duplicate can never slip
 * in through the front door using a naming convention the back-of-house
 * dedupe pass would have caught.
 *
 * Resolves brand from the model text itself when it disagrees with the
 * make column, strips redundant brand-word stacking before stripping
 * storage (order matters — see normalizeAppleModel), and applies
 * Apple-specific generation-ordinal normalization (digit/word/year
 * synonyms) before the final fuzzy strip.
 */
export type DeviceIdentity = {
  key: string
  brand: string
  categoryFamily: string
}

export function computeDeviceIdentity(
  make: string | null | undefined,
  model: string | null | undefined,
  category: string | null | undefined
): DeviceIdentity {
  const detected = detectBrandFromModel(model)
  const brand = detected || (MAKE_ALIASES[normalize(make ?? '')] ?? normalize(make ?? ''))

  let base = stripLeadingBrandWords(normalize(model ?? ''))
  base = sanitizeModelNoise(stripColor(stripStorage(base)))
  if (brand === 'apple') base = normalizeAppleModel(base)

  const categoryFamily = detectCategoryOverride(model) || normalizeCategoryFamily(category)
  const fuzzyModel = stripForFuzzyCompare(base)

  return { key: `${brand}||${categoryFamily}||${fuzzyModel}`, brand, categoryFamily }
}

export function computeDeviceIdentityKey(
  make: string | null | undefined,
  model: string | null | undefined,
  category: string | null | undefined
): string {
  return computeDeviceIdentity(make, model, category).key
}

/** Resolve canonical lowercase brand from device_catalog.make (no model-text override). */
export function resolveMakeColumn(make: string | null | undefined): string {
  return MAKE_ALIASES[normalize(make ?? '')] ?? normalize(make ?? '')
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
  // Strip a redundant leading make prefix (some templates include make
  // twice across columns, e.g. make="apple", model="apple iphone 15")
  // BEFORE stripping storage, not after. Order matters: stripStorage's bare
  // trailing-number heuristic only recognizes "iPhone 16" as a generation
  // number (not storage) when "iPhone" is the very first word — with
  // "Apple" still attached ("Apple iPhone 16 128GB"), the guard fails and
  // "16" gets misread as a second, already-stripped storage token, losing
  // the generation number entirely and producing a candidate that matches
  // the wrong device (or nothing at all).
  let csvModelRaw = sanitizeModelNoise(stripColor(stripStorage(stripLeadingMakePrefix(csvMake, deviceModel ?? ''))))

  // When make has full name "Samsung Galaxy S24" and model is empty, split it
  if (!csvModelRaw && csvMake) {
    const combined = `${deviceMake ?? ''} ${deviceModel ?? ''}`.trim()
    const split = splitMakeModel(combined)
    if (split) {
      csvMake = split.make
      csvModelRaw = sanitizeModelNoise(stripColor(stripStorage(stripLeadingMakePrefix(csvMake, split.model))))
    }
  }
  // When model has full name "Samsung Galaxy S24" and make is empty, split it
  if (!csvMake && csvModelRaw) {
    const split = splitMakeModel(deviceModel ?? '')
    if (split) {
      // Apply MAKE_ALIASES so "galaxy" → "samsung", "pixel" → "google", etc.
      csvMake = resolveMake(split.make)
      csvModelRaw = sanitizeModelNoise(stripColor(stripStorage(stripLeadingMakePrefix(csvMake, split.model))))
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

  // 4. Aggressive-normalized exact match: strip ALL punctuation/whitespace and
  //    treat "generation" same as "gen", then compare for exact equality.
  //    Catches naming-convention drift between an upload and the catalog
  //    ("iPhone SE (2nd Gen)" vs "iPhone SE (2nd generation)", "iPhone SE2"
  //    vs "iPhone SE 2") that the earlier tiers miss but that's still an
  //    unambiguous match — without the false-positive risk of tier 5's loose
  //    keyword search.
  for (const candidate of candidates) {
    const candidateFuzzy = stripForFuzzyCompare(candidate)
    if (!candidateFuzzy) continue
    const match = devices.find(
      (d) => normalize(d.make) === csvMake && stripForFuzzyCompare(normalize(d.model)) === candidateFuzzy
    )
    if (match) return match
  }

  // 5. Word-boundary keyword match: CSV model token appears as a whole word inside catalog model.
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
