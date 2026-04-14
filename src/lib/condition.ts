// ============================================================================
// CONDITION NORMALISATION — shared across CSV parsing and validation schemas
// ============================================================================
//
// Two approaches are combined:
//  1. Exact / phrase lookup — covers all trade-quote aliases seen in the wild
//     (grades A/B/C/D, "grade a", "good working condition", "like new", etc.)
//  2. Token-based fuzzy fallback — handles typos that survive the phrase lookup
//     ("excellant", "excelent", "brokn", etc.) by stripping punctuation/spaces
//     before comparing against a small set of root tokens.
//
// Call sites:
//  - src/lib/validations.ts  (schema preprocessing for API payloads)
//  - src/app/api/orders/parse-trade-template/route.ts  (CSV/Excel parsing)
// ============================================================================

export type CanonicalCondition =
  | 'new'
  | 'excellent'
  | 'good'
  | 'fair'
  | 'poor'
  | 'broken'    // maps to 'poor' for pricing; kept distinct for competitor comparison
  | 'recycle'   // not buyable — callers should skip/filter these rows

// ── Phrase / grade lookup ─────────────────────────────────────────────────────
const CONDITION_PHRASE_MAP: Record<string, CanonicalCondition> = {
  // New
  new: 'new', sealed: 'new', unopened: 'new',

  // Excellent
  excellent: 'excellent', 'like new': 'excellent', likenew: 'excellent',
  'a+': 'excellent', 'a-': 'excellent', 'grade a': 'excellent',

  // Good
  good: 'good', working: 'good', functional: 'good',
  'good working': 'good', 'good working condition': 'good',
  'used – working condition': 'good', 'used working condition': 'good',
  normal: 'good',

  // Fair
  fair: 'fair', average: 'fair', 'visible wear': 'fair',

  // Poor / broken (both land here; callers decide whether to merge)
  poor: 'poor',
  broken: 'broken', damaged: 'broken', cracked: 'broken',
  defective: 'broken', 'broken screen': 'broken', dead: 'broken',

  // Grades
  a: 'excellent',
  b: 'good', 'b+': 'good', 'b-': 'good', 'grade b': 'good',
  c: 'fair', 'c+': 'fair', 'c-': 'fair', 'grade c': 'fair',
  d: 'poor', 'grade d': 'poor',

  // Not buyable
  recycle: 'recycle', recycled: 'recycle', scrap: 'recycle',
}

// ── Token-based fuzzy fallback ────────────────────────────────────────────────
// Strips non-alpha characters so typos like "excellant", "excelent", "brokn"
// still resolve correctly. Only called when the phrase lookup misses.
function fuzzyConditionToken(token: string): CanonicalCondition | undefined {
  if (!token) return undefined
  if (token === 'new' || token.startsWith('brandnew')) return 'new'
  if (
    token === 'excellent' ||
    token === 'excellant' ||
    token === 'exacellent' ||
    token === 'exacellen' ||
    token === 'exellent' ||
    token === 'excelent' ||
    token === 'like' ||
    token.startsWith('likenew') ||
    token.startsWith('excel') ||
    token.startsWith('excell')
  ) return 'excellent'
  if (token === 'good' || token === 'gud' || token === 'gd') return 'good'
  if (token === 'fair' || token === 'fr' || token === 'average') return 'fair'
  if (
    token === 'poor' ||
    token === 'broken' ||
    token === 'brokn' ||
    token === 'broke' ||
    token.startsWith('damag') ||
    token.startsWith('crack') ||
    token.startsWith('defect')
  ) return token === 'poor' ? 'poor' : 'broken'
  return undefined
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Normalise any raw condition input from a CSV, form, or API payload.
 *
 * Returns a CanonicalCondition, or `undefined` when the input cannot be
 * classified (callers decide on a default — typically 'good').
 */
export function normalizeConditionRaw(input: unknown): CanonicalCondition | undefined {
  if (input == null) return undefined
  // Strip trailing punctuation (e.g. "Reset and cleaned." → "reset and cleaned")
  const s = String(input).toLowerCase().trim().replace(/[.!?,;]+$/, '')
  if (!s) return undefined

  // 1. Exact / phrase lookup (handles multi-word aliases and grades)
  const phrase = CONDITION_PHRASE_MAP[s]
  if (phrase) return phrase

  // 2. Token-based fuzzy (strip punctuation/spaces to catch typos)
  const token = s.replace(/[^a-z]/g, '')
  const fuzzy = fuzzyConditionToken(token)
  if (fuzzy) return fuzzy

  // 3. Prose fallback — for free-text condition notes from ITAD customer sheets
  //    Order: check worst damage first, then battery issues, then fair cosmetics
  if (s.includes('swollen') || (s.includes('battery') && (s.includes("can't hold") || s.includes('dead') || s.includes('not hold')))) return 'fair'
  if (s.includes('minor dent') || s.includes('minor scratch') || s.includes('minor crack')) return 'fair'
  if ((s.includes('dent') || s.includes('scratch') || s.includes('ding')) && !s.includes('no dent') && !s.includes('no scratch')) return 'fair'
  if (s.includes('reset and cleaned') || s.includes('good') || s.includes('normal') || s.includes('clean') || s.includes('working')) return 'good'
  if (s.includes('unknown') || s.includes('used')) return 'good'

  return undefined
}

/**
 * Convenience wrapper for pricing contexts:
 * - 'broken' and 'recycle' collapse to 'poor'
 * - Unknown input defaults to 'good'
 */
export function normalizePricingCondition(input: unknown): 'new' | 'excellent' | 'good' | 'fair' | 'poor' {
  const c = normalizeConditionRaw(input)
  if (!c) return 'good'
  if (c === 'broken' || c === 'recycle') return 'poor'
  return c
}

/**
 * Convenience wrapper for competitor-comparison contexts:
 * - 'new' folds to 'excellent' (market doesn't price "new" separately)
 * - 'poor' stays as 'poor'
 * - 'broken' and 'recycle' become 'broken'
 * - Unknown input defaults to 'good'
 */
export function normalizeCompetitorCondition(input: unknown): 'excellent' | 'good' | 'fair' | 'poor' | 'broken' {
  const c = normalizeConditionRaw(input)
  if (!c) return 'good'
  if (c === 'new') return 'excellent'
  if (c === 'recycle') return 'broken'
  return c
}

/**
 * Convenience wrapper for CSV trade-quote parsing:
 * - 'recycle' is preserved (callers skip these rows)
 * - Unknown input defaults to 'good'
 */
export function normalizeTradeCondition(input: unknown): string {
  return normalizeConditionRaw(input) ?? 'good'
}
