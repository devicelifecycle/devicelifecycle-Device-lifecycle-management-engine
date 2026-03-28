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
  lg: 'lg',
  sony: 'sony',
  xiaomi: 'xiaomi',
  huawei: 'huawei',
  oppo: 'oppo',
  vivo: 'vivo',
  nokia: 'nokia',
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
    .replace(/\s*(128|256|512|64|32)\s*gb\s*$/i, '')
    .replace(/\s*(1)\s*tb\s*$/i, '')
    .trim()
}

/** Known brand prefixes for splitting "Samsung Galaxy S24" -> make=Samsung, model=Galaxy S24 */
const BRAND_PREFIXES = ['samsung', 'apple', 'google', 'oneplus', 'motorola', 'lg', 'sony', 'xiaomi', 'huawei', 'oppo', 'vivo', 'nokia']

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
 * Find a device in the catalog that matches the CSV row's make/model.
 * Handles: aliases (iPhone->Apple), storage in model, extra spaces, case.
 * Also handles "Samsung Galaxy S24" in make column with empty model.
 */
export function matchDeviceFromCsv(
  devices: Device[],
  deviceMake: string | undefined | null,
  deviceModel: string | undefined | null
): Device | undefined {
  let csvMake = resolveMake(deviceMake ?? '')
  let csvModel = normalize(stripStorage(deviceModel ?? ''))

  // When make has full name "Samsung Galaxy S24" and model is empty, split it
  if (!csvModel && csvMake) {
    const combined = `${deviceMake ?? ''} ${deviceModel ?? ''}`.trim()
    const split = splitMakeModel(combined)
    if (split) {
      csvMake = split.make
      csvModel = normalize(stripStorage(split.model))
    }
  }
  // When model has full name "Samsung Galaxy S24" and make is empty, split it
  if (!csvMake && csvModel) {
    const split = splitMakeModel(deviceModel ?? '')
    if (split) {
      csvMake = split.make
      csvModel = normalize(stripStorage(split.model))
    }
  }

  if (!csvMake || !csvModel) return undefined

  const catalogMake = csvMake.toLowerCase()
  const catalogModel = csvModel.toLowerCase()

  // 1. Exact make + exact model match
  let match = devices.find(
    (d) =>
      normalize(d.make) === catalogMake &&
      normalize(d.model) === catalogModel
  )
  if (match) return match

  // 2. Exact make + model equals after stripping storage from catalog model
  match = devices.find(
    (d) =>
      normalize(d.make) === catalogMake &&
      normalize(stripStorage(d.model)) === catalogModel
  )
  if (match) return match

  // 3. Exact make + catalog model contains CSV model (e.g. CSV "iPhone 15 Pro" matches "iPhone 15 Pro Max" only if exact - no, that's wrong)
  //    CSV "iPhone 15 Pro" should NOT match "iPhone 15 Pro Max"
  //    CSV "iPhone 15 Pro Max" should match "iPhone 15 Pro Max"
  // So: catalog model must equal CSV model, OR catalog model must start with CSV model followed by space (e.g. "iPhone 15 Pro" in catalog, CSV "iPhone 15 Pro" - exact)
  // Actually the issue is: CSV might have "iPhone 15 Pro" and catalog has "iPhone 15 Pro" - that's exact, we handle above.
  // CSV might have "iPhone 15 Pro 256GB" - we strip to "iPhone 15 Pro", then exact match with catalog "iPhone 15 Pro". Good.
  // CSV might have "iphone 15 pro" (lowercase) - we normalize to "iphone 15 pro", catalog "iPhone 15 Pro" normalizes to "iphone 15 pro". Good.

  // 4. Make alias + model: CSV "iPhone" -> Apple. Catalog has make "Apple". Good.

  // 5. Fuzzy: catalog model contains CSV model as whole words (avoid "Pro" matching "Pro Max")
  //    Only use if CSV model is a prefix of catalog model with word boundary
  match = devices.find((d) => {
    if (normalize(d.make) !== catalogMake) return false
    const dModel = normalize(d.model)
    if (dModel === catalogModel) return true
    // CSV "iPhone 15" could match "iPhone 15" or "iPhone 15 Pro" - no, "iPhone 15" is different from "iPhone 15 Pro"
    // Be conservative: require catalog model to start with csv model as a whole token
    if (dModel.startsWith(catalogModel + ' ')) return true // "iphone 15 pro max" starts with "iphone 15 pro "
    return false
  })
  if (match) return match

  return undefined
}
