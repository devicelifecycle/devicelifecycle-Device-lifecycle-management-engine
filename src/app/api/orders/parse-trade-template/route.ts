// ============================================================================
// TRADE TEMPLATE PARSER API
// POST /api/orders/parse-trade-template?sheet=<name|index>
//
// Accepts customer trade quote files in any format (Excel/CSV).
// Handles 8 real-world layout patterns found in COE and SCC ITAD files:
//   1. Simple batch (Model, Qty, Price)
//   2. Multi-row merged headers (30 Days → Good / Fair sub-columns)
//   3. Combined make+model+storage+color in one cell
//   4. Missing Make column — brand inferred from model string
//   5. Pivot / transposed tables (models as columns, conditions as rows)
//   6. Storage-as-column-header (32 GB / 128 GB price columns)
//   7. Header row not at row 0 — auto-detected by keyword scoring
//   8. Per-device manifest with IMEI/Serial
//
// Does NOT write to DB — the client submits matched rows separately.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { matchDeviceFromCsv, isPlausibleBrand, extractColor, stripColor, computeDeviceIdentityKey } from '@/lib/device-match'
import { normalizeTradeCondition } from '@/lib/condition'
import type { Device } from '@/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// ── Module-level catalog cache ────────────────────────────────────────────────
// Serverless functions reuse the same Node.js module within a warm instance.
// Caching the device catalog for 5 minutes eliminates a 100-200ms DB round-trip
// on every file upload without requiring Redis or any external service.
let _catalogCache: Device[] | null = null
let _catalogCacheAt = 0
const CATALOG_TTL_MS = 5 * 60 * 1000

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getCatalog(supabase: any): Promise<Device[]> {
  const now = Date.now()
  if (_catalogCache && now - _catalogCacheAt < CATALOG_TTL_MS) return _catalogCache
  const { data } = await supabase
    .from('device_catalog')
    .select('id, make, model, specifications, category')
    .eq('is_active', true)
    .order('make')
  _catalogCache = (data ?? []) as Device[]
  _catalogCacheAt = now
  return _catalogCache
}

/** Call when a new device is inserted so the next request gets a fresh catalog. */
function invalidateCatalogCache() {
  _catalogCache = null
}

// ── Known device brands (for combined-field splitting and brand inference) ───
const KNOWN_BRANDS = ['apple', 'samsung', 'google', 'motorola', 'lg', 'sony',
  'oneplus', 'sonim', 'kyocera', 'blackberry', 'netgear', 'novatel',
  'inseego', 'microsoft', 'lenovo', 'dell', 'hp', 'asus']

// ── Column aliases covering all trade quote formats seen in the wild ─────────
const TRADE_COLUMN_MAP: Record<string, string> = {
  // Device identification — brand/make
  'make': 'brand', 'brand': 'brand', 'manufacturer': 'brand', 'oem': 'brand',
  'mfr': 'brand', 'mfg': 'brand', 'mfg.': 'brand', 'vendor': 'brand',
  'device_make': 'brand', 'device make': 'brand',
  'device manufacturer': 'brand', 'device brand': 'brand',
  'phone brand': 'brand', 'phone make': 'brand', 'phone_brand': 'brand',
  'phone_make': 'brand', 'make/brand': 'brand', 'brand/make': 'brand',
  'company': 'brand', 'oem/manufacturer': 'brand',

  // Device identification — model
  'model': 'model', 'device': 'model', 'device model': 'model', 'device_model': 'model',
  'model name': 'model', 'phone model': 'model', 'existing phone': 'model', 'models': 'model',
  // Generic description columns (most common in corporate ITAD / TD Synnex files)
  'description': 'model', 'desc': 'model',
  'item description': 'model', 'item desc': 'model',
  'product description': 'model', 'prod description': 'model', 'prod desc': 'model',
  'asset description': 'model', 'asset desc': 'model',
  'device description': 'model', 'device desc': 'model',
  'hardware description': 'model', 'hardware desc': 'model',
  'equipment description': 'model', 'equipment desc': 'model', 'equipment model': 'model',
  'unit description': 'model', 'unit desc': 'model',
  'article description': 'model',
  'part description': 'model', 'part name': 'model',
  'product name': 'model', 'item name': 'model',
  'asset name': 'model', 'equipment name': 'model',
  'device name': 'model', 'device_name': 'model',
  'full description': 'model', 'full name': 'model',
  'hardware model': 'model',

  // 'product' and 'sku' map to product_number — these are typically internal IDs
  // (e.g. Apple A1990, A2141) while a separate description column holds the model name.
  // We fall back to product_number when model is empty (see extraction logic below).
  'product': 'product_number', 'product number': 'product_number', 'product id': 'product_number',
  'sku': 'product_number', 'part number': 'product_number', 'part #': 'product_number',
  'part no': 'product_number', 'part no.': 'product_number',
  'item number': 'product_number', 'item no': 'product_number', 'item no.': 'product_number',
  'mfr part number': 'product_number', 'mfr part no': 'product_number',

  // Storage
  'storage': 'storage', 'capacity': 'storage', 'gb': 'storage',
  'storage/gb': 'storage', 'memory': 'storage',
  'storage capacity': 'storage', 'disk size': 'storage',
  'drive size': 'storage', 'internal storage': 'storage',
  'device storage': 'storage', 'memory size': 'storage',

  // Condition (many customer aliases)
  'condition': 'condition', 'grade': 'condition', 'condtion': 'condition',
  'condiiton': 'condition', 'device condition': 'condition',
  'condition of device': 'condition', 'state': 'condition',
  'cosmetic grade': 'condition', 'grading': 'condition',

  // Quantity
  'quantity': 'quantity', 'qty': 'quantity', 'count': 'quantity',
  'count of mobile': 'quantity', 'total': 'quantity', 'num': 'quantity',
  '#': 'quantity', 'device count': 'quantity', 'volume': 'quantity',
  'units': 'quantity', 'unit count': 'quantity', 'unit qty': 'quantity',
  'device qty': 'quantity', 'no of units': 'quantity',
  'number of units': 'quantity', 'total units': 'quantity',
  'total devices': 'quantity', 'no.': 'quantity',

  // Pricing — customer net is the canonical price
  'customer': 'customer_net', 'net customer': 'customer_net',
  'customer net': 'customer_net', 'net': 'customer_net',
  'customer quote': 'customer_net', 'bridge': 'customer_net',
  'net bridge/': 'customer_net', 'eg price': 'customer_net',

  // Gross / market price
  'gross': 'gross_price', 'value': 'gross_price', 'gross price': 'gross_price',
  'total good': 'gross_price', 'good': 'gross_price', '30 good': 'gross_price',
  '30d good': 'gross_price', 'good working (gross)': 'gross_price',
  'price': 'gross_price', 'unit price': 'gross_price', 'per unit': 'gross_price',
  'est value': 'gross_price', 'suggested': 'gross_price', 'quote': 'gross_price',
  'tdsynnex offer per unit': 'gross_price', 'gr good': 'gross_price',

  // Fair-condition pricing
  'fair': 'fair_price', '30 fair': 'fair_price', '30d fair': 'fair_price',
  'total fair': 'fair_price', 'gr fair': 'fair_price',

  // Carrier / spiff deductions
  'bell': 'carrier_deduction', 'spiff': 'carrier_deduction',
  'carrier spiff': 'carrier_deduction', 'rogers': 'carrier_deduction',

  // EG / processing fee
  'eg': 'eg_deduction', 'evergreen': 'eg_deduction', 'fee': 'eg_deduction',
  'processing': 'eg_deduction',

  // Per-device identifiers
  'imei': 'imei', 'imei/serial': 'imei', 'imei / serial': 'imei',
  'imei/sn': 'imei', 'imei/s/n': 'imei', 'imei/serial number': 'imei',
  'serial': 'serial', 'serial number': 'serial', 'serial_number': 'serial',
  'sample s/n': 'serial', 's/n': 'serial', 'sn': 'serial',
  'asset tag': 'serial', 'asset #': 'serial', 'asset number': 'serial',
  'device id': 'serial', 'barcode': 'serial',
  'device serial': 'serial', 'device serial number': 'serial',
  'unit serial': 'serial',

  // Extras
  'color': 'color', 'colour': 'color',
  'accessories': 'accessories', 'accessories/adapters': 'accessories',
  'accessories. ex., charger?': 'accessories',
  'notes': 'notes', 'comments': 'notes', 'faults': 'notes',
  'year': 'year', 'cpu': 'cpu', 'ram': 'ram', 'screen size': 'screen_size',
  'battery': 'battery', 'battery health': 'battery', 'battery %': 'battery',
}

// Levenshtein edit distance (with early exit for long strings)
function levenshtein(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return 99
  if (a.length > 20 || b.length > 20) return 99
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array(n + 1).fill(0).map((__, j) => i === 0 ? j : j === 0 ? i : 0)
  )
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
  return dp[m][n]
}

function mapColumn(header: string): string | undefined {
  const lower = header.toLowerCase().trim().replace(/\s+/g, ' ')
  if (TRADE_COLUMN_MAP[lower]) return TRADE_COLUMN_MAP[lower]
  // Fuzzy match with edit distance ≤ 2
  let best: string | undefined
  let bestDist = 3
  for (const key of Object.keys(TRADE_COLUMN_MAP)) {
    const dist = levenshtein(lower, key)
    if (dist < bestDist) { bestDist = dist; best = TRADE_COLUMN_MAP[key] }
  }
  return best
}

// ── Header row detection ──────────────────────────────────────────────────────
// Score each row by how many cells match known column keywords.
// The highest-scoring row is the header row — handles files where row 0 is a
// date/title and real headers are in row 1, 2, or even row 10 (Lambton sheet).

const HEADER_KEYWORDS = new Set([
  'model', 'make', 'brand', 'manufacturer', 'serial', 'imei', 'condition',
  'storage', 'quantity', 'qty', 'count', 'price', 'value', 'gross', 'net',
  'customer', 'grade', 'product', 'year', 'cpu', 'ram', 'memory', 'device',
  'accessories', 'capacity', 'colour', 'color', 'notes', 'faults',
])

function scoreHeaderRow(row: unknown[]): number {
  let score = 0
  for (const cell of row) {
    const s = String(cell ?? '').toLowerCase().trim()
    if (!s) continue
    if (HEADER_KEYWORDS.has(s)) { score += 3; continue }
    for (const kw of HEADER_KEYWORDS) {
      if (s.includes(kw)) { score += 1; break }
    }
  }
  return score
}

function findHeaderRow(rawRows: unknown[][]): { headerIdx: number; groupIdx: number | null } {
  let bestScore = 0
  let headerIdx = 0
  const limit = Math.min(rawRows.length, 15)
  for (let i = 0; i < limit; i++) {
    const score = scoreHeaderRow(rawRows[i])
    if (score > bestScore) { bestScore = score; headerIdx = i }
  }
  // If there is a row above the header with ≥2 non-empty cells → it's a group label row
  const groupIdx = (headerIdx > 0 && rawRows[headerIdx - 1].filter(c => String(c ?? '').trim()).length >= 2)
    ? headerIdx - 1
    : null
  return { headerIdx, groupIdx }
}

// ── Multi-row header merging ──────────────────────────────────────────────────
// When groupIdx exists, prepend the group label to each sub-header.
// E.g. "30 Days" (group) + "Good" (sub) → "30 Good"
// E.g. "Good Condition" (group) + "Total" (sub) → "Good Condition Total"

function buildHeaders(rawRows: unknown[][], headerIdx: number, groupIdx: number | null): string[] {
  const subRow = rawRows[headerIdx]
  if (!groupIdx) {
    return subRow.map(c => String(c ?? '').trim())
  }
  const groupRow = rawRows[groupIdx]
  // Walk left to find the group label for each column (merged cells repeat their value leftward)
  let lastGroup = ''
  const headers: string[] = []
  for (let i = 0; i < subRow.length; i++) {
    const group = String(groupRow[i] ?? '').trim()
    if (group) lastGroup = group
    const sub = String(subRow[i] ?? '').trim()
    if (lastGroup && sub && !sub.toLowerCase().includes(lastGroup.toLowerCase().split(' ')[0])) {
      // Shorten group prefix: "30 Days" → "30", "Good Condition" → "Good"
      const prefix = lastGroup.split(' ')[0]
      headers.push(`${prefix} ${sub}`)
    } else {
      headers.push(sub)
    }
  }
  return headers
}

// ── Combined make+model+storage+color splitting ───────────────────────────────
// Handles cells like "Apple iPhone 12 64GB Black" or "Apple iPhone 14 128GB Blue"
// that some customers put everything in a single column.

function splitCombinedField(cell: string): { brand: string; model: string; storage: string; color: string } {
  const s = cell.trim()
  const lower = s.toLowerCase()

  // Extract storage token (e.g. "64GB", "128 GB", "1TB")
  const storageMatch = s.match(/\b(\d+)\s*(GB|TB)\b/i)
  const storage = storageMatch ? `${storageMatch[1]}${storageMatch[2].toUpperCase()}` : ''

  // Remove storage token to find brand/model/color
  const withoutStorage = s.replace(/\b\d+\s*(GB|TB)\b/i, '').replace(/\s+/g, ' ').trim()
  const parts = withoutStorage.split(/\s+/)

  // Find brand (first word if it's a known brand)
  const firstLower = (parts[0] ?? '').toLowerCase()
  const brand = KNOWN_BRANDS.includes(firstLower) ? parts[0] : ''

  const remaining = brand ? parts.slice(1) : parts

  // Find color (last word if it's all-alpha and not a model keyword)
  const lastWord = remaining[remaining.length - 1] ?? ''
  const looksLikeColor = /^[A-Za-z]+$/.test(lastWord) && !['pro', 'max', 'plus', 'ultra', 'mini', 'lite'].includes(lastWord.toLowerCase())
  const color = (remaining.length > 1 && looksLikeColor) ? lastWord : ''

  const modelParts = color ? remaining.slice(0, -1) : remaining
  const model = modelParts.join(' ')

  // If no brand found but cell starts with a known Apple model prefix, infer Apple
  const finalBrand = brand || (lower.match(/\b(iphone|ipad|macbook|imac|airpods)/) ? 'Apple' : '')

  return { brand: finalBrand, model, storage, color }
}

// ── Brand inference from model string ────────────────────────────────────────
// Used when no brand/make column exists in the template.

function inferBrand(modelStr: string): string {
  const lower = modelStr.toLowerCase()
  if (lower.match(/\b(iphone|ipad|macbook|imac|airpods|apple)\b/)) return 'Apple'
  if (lower.match(/\b(galaxy|samsung)\b/)) return 'Samsung'
  if (lower.match(/\b(pixel|google)\b/)) return 'Google'
  if (lower.match(/\b(moto[a-z]*|motorola)\b/)) return 'Motorola'
  if (lower.match(/\bsonim\b/)) return 'Sonim'
  if (lower.match(/\b(surface|microsoft)\b/)) return 'Microsoft'
  if (lower.match(/\b(thinkpad|lenovo)\b/)) return 'Lenovo'
  // Fallback: first word that isn't a number or an Apple model identifier (A1990, A2141 etc.)
  const firstWord = modelStr.trim().split(/\s+/)[0]
  if (/^\d+$/.test(firstWord)) return ''
  if (/^A\d{4}$/.test(firstWord)) return 'Apple'  // Apple internal model numbers
  return firstWord
}

// ── Pivot table detection + transposition ─────────────────────────────────────
// Handles PAL Aero / AMA RFQ format where models are COLUMN HEADERS and
// pricing categories (Gross, Bell, EG, Customer Quote) are ROW LABELS.

const PIVOT_ROW_KEYWORDS = ['gross', 'bell', 'eg', 'customer', 'working', 'spiff', 'deduction', 'fee']
const MODEL_KEYWORDS = ['iphone', 'ipad', 'galaxy', 'pixel', 'se', 'pro', 'max', 'ultra', 'air', 'plus']

function detectPivot(headers: string[], dataRows: string[][]): boolean {
  // Col-0 of first 6 data rows should contain ≥2 pricing keywords
  const col0Values = dataRows.slice(0, 6).map(r => String(r[0] ?? '').toLowerCase())
  const pricingMatches = col0Values.filter(v => PIVOT_ROW_KEYWORDS.some(kw => v.includes(kw))).length
  if (pricingMatches < 2) return false
  // headers[1..] should contain ≥1 model-looking token
  const modelHeaders = headers.slice(1).filter(h => {
    const lower = h.toLowerCase()
    return MODEL_KEYWORDS.some(kw => lower.includes(kw)) || /^\d+$/.test(h.trim())
  })
  return modelHeaders.length >= 1
}

function parsePivot(headers: string[], dataRows: string[][]): ParsedRow[] {
  const results: ParsedRow[] = []
  // Each column (index 1..n) is a model; each matching row gives us a price field
  for (let col = 1; col < headers.length; col++) {
    const modelRaw = headers[col]
    if (!modelRaw) continue
    const { brand, model, storage } = splitCombinedField(modelRaw)
    const finalBrand = brand || inferBrand(modelRaw)
    const finalModel = model || modelRaw

    let gross_price: number | null = null
    let customer_net: number | null = null
    let carrier_deduction: number | null = null
    let eg_deduction: number | null = null

    for (const row of dataRows) {
      const rowLabel = String(row[0] ?? '').toLowerCase()
      const rawVal = String(row[col] ?? '').trim()
      const val = parsePriceCell(rawVal)
      if (!val) continue
      if (rowLabel.includes('gross') || rowLabel.includes('working')) gross_price = val
      else if (rowLabel.includes('customer') || rowLabel.includes('net')) customer_net = val
      else if (rowLabel.includes('bell') || rowLabel.includes('rogers') || rowLabel.includes('spiff')) carrier_deduction = val
      else if (rowLabel.includes('eg') || rowLabel.includes('evergreen') || rowLabel.includes('fee')) eg_deduction = val
    }

    if (!finalModel) continue
    results.push({
      brand: finalBrand,
      model: finalModel,
      storage: storage || '',
      condition: 'good',
      quantity: 1,
      gross_price,
      fair_price: null,
      customer_net,
      carrier_deduction,
      eg_deduction,
      imei: '',
      serial: '',
      year: '',
      notes: '',
    })
  }
  return results
}

// ── Storage-as-column detection ───────────────────────────────────────────────
// Handles "Isl key" format: "32 GB" / "128 GB" are column headers where
// the non-empty price value tells you the storage for that device row.

function detectStorageColumns(headers: string[]): Record<number, string> {
  const map: Record<number, string> = {}
  for (let i = 0; i < headers.length; i++) {
    const m = headers[i].match(/^(\d+)\s*(GB|TB)$/i)
    if (m) map[i] = `${m[1]}${m[2].toUpperCase()}`
  }
  return map
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function normalizeStorage(value: string | undefined | null): string {
  if (!value) return ''
  return value
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/gigabytes?/g, 'gb')
    .replace(/terabytes?/g, 'tb')
    .trim()
    .toUpperCase()
    .replace(/^(\d+)(GB|TB)$/, '$1$2')
}

function parsePriceCell(value: string | undefined | null): number | null {
  if (!value) return null
  const cleaned = String(value).replace(/[$,\s]/g, '').trim()
  const n = parseFloat(cleaned)
  return Number.isFinite(n) && n > 0 ? n : null
}

// ── Infer device category from make/model string ──────────────────────────────
function inferDeviceCategory(make: string, model: string): string {
  const lower = `${make} ${model}`.toLowerCase()
  if (lower.match(/\b(ipad|galaxy tab|surface|tab s\d|tab a\d)\b/)) return 'tablet'
  if (lower.match(/\b(macbook|thinkpad|laptop|notebook|xps|chromebook)\b/)) return 'laptop'
  return 'smartphone'
}

// ── Merge detected colors into already-matched devices ────────────────────────
// "Galaxy S24" already in catalog, this row says "Galaxy S24 Black" — record
// Black on the existing device instead of leaving it as dead-end metadata
// (matchDeviceFromCsv already strips color before comparing, so this row
// matched the existing device rather than spawning a duplicate).
async function mergeDetectedColors(outputRows: TradeTemplateRow[]): Promise<void> {
  const serviceRole = createServiceRoleClient()
  const colorsByDevice = new Map<string, Set<string>>()

  for (const row of outputRows) {
    if (!row.device_id) continue
    const color = extractColor(row.model || '')
    if (!color) continue
    if (!colorsByDevice.has(row.device_id)) colorsByDevice.set(row.device_id, new Set())
    colorsByDevice.get(row.device_id)!.add(color)
  }

  if (colorsByDevice.size === 0) return

  const { data: devices } = await serviceRole
    .from('device_catalog')
    .select('id, specifications')
    .in('id', [...colorsByDevice.keys()])

  for (const device of devices || []) {
    const newColors = colorsByDevice.get(device.id)
    if (!newColors) continue
    const existingColors: string[] = ((device.specifications as { colors?: string[] } | null)?.colors) || []
    const existingLower = new Set(existingColors.map((c) => c.toLowerCase()))
    const toAdd = [...newColors].filter((c) => !existingLower.has(c.toLowerCase()))
    if (toAdd.length === 0) continue
    const updatedSpecs = { ...(device.specifications as Record<string, unknown> | null), colors: [...existingColors, ...toAdd] }
    await serviceRole.from('device_catalog').update({ specifications: updatedSpecs }).eq('id', device.id)
  }
}

// ── Auto-add unmatched devices to device_catalog via service role ─────────────
// Runs after CSV matching. For each (make, model) not found in the catalog,
// inserts a placeholder device entry so the order item can reference a device_id.
async function autoAddUnmatched(outputRows: TradeTemplateRow[], catalog: Device[]): Promise<TradeTemplateRow[]> {
  const serviceRole = createServiceRoleClient()
  await mergeDetectedColors(outputRows)

  // Group unmatched rows by (make, model) to avoid duplicate inserts.
  // Skip rows whose "make" doesn't actually look like a brand (IMEI/serial/
  // part number from a misidentified column) — leave them not_in_catalog
  // for manual review instead of polluting device_catalog with garbage.
  // Strip any trailing color so it doesn't get baked into the new catalog
  // entry's model name — it's seeded into specifications.colors instead.
  const groups = new Map<string, { make: string; model: string; color?: string; indices: number[] }>()
  outputRows.forEach((row, i) => {
    if (row.device_id || !row.make || !isPlausibleBrand(row.make)) return
    const color = extractColor(row.model || '')
    const model = color ? (stripColor(row.model) || row.model) : row.model
    const key = `${row.make.toLowerCase()}|${model.toLowerCase()}`
    const entry = groups.get(key)
    if (entry) entry.indices.push(i)
    else groups.set(key, { make: row.make, model, color, indices: [i] })
  })

  // Recurrence guard: matchDeviceFromCsv already tried this make/model and
  // failed, but its candidate list leans on Apple-specific normalization —
  // it isn't brand-agnostic. Before creating a new row, do one more
  // aggressive-fuzzy check (the same identity key the catalog-wide dedupe
  // script uses) against every active catalog row regardless of brand.
  // This is what would have stopped the Pixel 7a / Galaxy A54 / iPhone SE
  // duplicates this session's dedupe pass found from ever being created.
  const catalogByIdentity = new Map<string, Device>()
  for (const d of catalog) {
    catalogByIdentity.set(computeDeviceIdentityKey(d.make, d.model, d.category), d)
  }
  for (const [key, group] of groups) {
    const identityKey = computeDeviceIdentityKey(group.make, group.model, inferDeviceCategory(group.make, group.model))
    const existing = catalogByIdentity.get(identityKey)
    if (existing) {
      for (const idx of group.indices) {
        outputRows[idx] = { ...outputRows[idx], device_id: existing.id, match_status: 'auto_added' as const }
      }
      groups.delete(key)
    }
  }

  if (groups.size === 0) return outputRows

  const result = [...outputRows]
  const groupEntries = [...groups.values()]

  // Single batched insert instead of one round-trip per unique unmatched
  // device — Postgres preserves row order in the RETURNING clause for a
  // plain multi-row insert, so the response can be zipped back to
  // groupEntries by index.
  const payloads = groupEntries.map(({ make, model, color }) => ({
    make,
    model,
    category: inferDeviceCategory(make, model),
    is_active: true,
    specifications: color ? { colors: [color] } : {},
  }))

  try {
    const { data: inserted, error: insertErr } = await serviceRole
      .from('device_catalog')
      .insert(payloads)
      .select('id')

    if (insertErr) {
      if ((insertErr as { code?: string }).code === '23505') {
        // Unique conflict somewhere in the batch — fall back to resolving
        // each group individually against existing catalog rows.
        for (const { make, model, indices } of groupEntries) {
          const { data: existing } = await serviceRole
            .from('device_catalog')
            .select('id')
            .ilike('make', make)
            .ilike('model', model)
            .limit(1)
            .maybeSingle()
          if (existing?.id) {
            for (const idx of indices) {
              result[idx] = { ...result[idx], device_id: existing.id, match_status: 'auto_added' as const }
            }
          }
        }
      } else {
        console.error('[parse-trade-template] batch auto-add devices failed:', insertErr)
      }
    } else if (inserted) {
      inserted.forEach((row, i) => {
        const group = groupEntries[i]
        if (!row?.id || !group) return
        for (const idx of group.indices) {
          result[idx] = { ...result[idx], device_id: row.id, match_status: 'auto_added' as const }
        }
      })
    }
  } catch (e) {
    console.error('[parse-trade-template] batch auto-add devices failed:', e)
  }

  return result
}

// LLM fallback — ask Groq to infer columns when confidence is low
async function inferColumnsWithLLM(
  headers: string[],
  sampleRows: string[][]
): Promise<Record<string, string> | null> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) return null
  try {
    const sampleText = [headers.join(' | '), ...sampleRows.slice(0, 3).map(r => r.join(' | '))].join('\n')
    const prompt = `You are parsing a corporate device trade-in spreadsheet.
Here are the column headers and 3 sample rows (pipe-separated):

${sampleText}

Return ONLY a valid JSON object mapping each column header to one of these canonical fields:
brand, model, product_number, storage, condition, quantity, customer_net, gross_price, fair_price, carrier_deduction, eg_deduction, imei, serial, color, notes, year, ignore

Example: {"Phone Model": "model", "Device Count": "quantity", "30 Days Good": "gross_price", "30 Days Fair": "fair_price"}

Rules:
- If a column is a price with "good" context → gross_price
- If a column is a price with "fair" context → fair_price
- If a column is "net", "customer", or the final customer take-home → customer_net
- Bell/Rogers/spiff columns → carrier_deduction
- EG/Evergreen/processing fee → eg_deduction
- "Product" or "Part #" columns containing internal model codes (e.g. A1990) → product_number
- Columns you cannot classify → ignore
- Return ONLY the JSON, no explanation`

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
        temperature: 0,
      }),
    })
    if (!res.ok) return null
    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
    const text = data.choices?.[0]?.message?.content?.trim() ?? ''
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    return JSON.parse(jsonMatch[0]) as Record<string, string>
  } catch {
    return null
  }
}

// ── Types ────────────────────────────────────────────────────────────────────
type ParsedRow = {
  brand: string
  model: string
  storage: string
  condition: string
  quantity: number
  gross_price: number | null
  fair_price: number | null
  customer_net: number | null
  carrier_deduction: number | null
  eg_deduction: number | null
  imei: string
  serial: string
  year: string
  notes: string
}

export type TradeTemplateRow = {
  make: string
  model: string
  storage: string
  condition: string
  quantity: number
  unit_price: number | null
  serials: string[]
  imeis: string[]
  device_id: string | null
  match_status: 'matched' | 'catalog_matched' | 'not_in_catalog' | 'auto_added'
  row_error?: string
  /** Upload-time warnings shown to customer and admin (e.g. qty was 0, model missing) */
  upload_notes?: string
}

export type TradeTemplateSummary = {
  total_devices: number
  matched: number
  unmatched: number
  total_value: number | null
  format_type: 'batch' | 'per_device' | 'unknown'
  detected_columns: Record<string, string>
  llm_assisted: boolean
  sheet_parsed: string
}

// ── Main handler ─────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    const allowedRoles = ['admin', 'coe_manager', 'coe_tech', 'sales', 'customer']
    if (!allowedRoles.includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // ── JSON path: pre-parsed rows from large-file client-side processing ────
    // The customer page parses files >5 MB in the browser and sends aggregated
    // rows as JSON so this handler only needs to do device matching + auto-add.
    const contentType = request.headers.get('content-type') ?? ''
    if (contentType.includes('application/json')) {
      interface PreParsedRow {
        make: string; model: string; storage: string; condition: string
        quantity: number; imeis: string[]; serials: string[]
      }
      const body = await request.json() as { rows?: PreParsedRow[] }
      const inputRows: PreParsedRow[] = Array.isArray(body.rows) ? body.rows : []
      if (inputRows.length === 0) {
        return NextResponse.json({ error: 'No rows provided' }, { status: 400 })
      }
      const catalog = await getCatalog(supabase)
      const outputRows: TradeTemplateRow[] = inputRows.map(row => {
        const rowNotes: string[] = []
        if (row.quantity === 0) rowNotes.push('Quantity was 0 in your file')
        if (!row.model) rowNotes.push('Model not specified in your file')
        const device = row.model ? matchDeviceFromCsv(catalog, row.make, row.model) : null
        return {
          make: row.make || 'Unknown', model: row.model, storage: row.storage,
          condition: normalizeTradeCondition(row.condition),
          quantity: row.quantity, unit_price: null,
          serials: row.serials, imeis: row.imeis,
          device_id: device?.id ?? null,
          match_status: (device ? 'matched' : 'not_in_catalog') as 'matched' | 'catalog_matched' | 'not_in_catalog',
          ...(rowNotes.length > 0 ? { upload_notes: rowNotes.join(' | ') } : {}),
        }
      })
      const finalRows = await autoAddUnmatched(outputRows, catalog)
      if (finalRows.some(r => r.match_status === 'auto_added')) invalidateCatalogCache()
      const matched = finalRows.filter(r => r.device_id).length
      const totalDevices = finalRows.reduce((s, r) => s + r.quantity, 0)
      return NextResponse.json({
        rows: finalRows,
        summary: {
          total_devices: totalDevices, matched,
          unmatched: finalRows.length - matched, total_value: null,
          format_type: 'batch' as const, detected_columns: {}, llm_assisted: false, sheet_parsed: 'client-parsed',
        },
        rows_truncated: 0,
      })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

    const ext = file.name.toLowerCase().split('.').pop() ?? ''

    // ── Sheet selection ───────────────────────────────────────────────────────
    const sheetParam = request.nextUrl.searchParams.get('sheet') ?? ''

    let headers: string[] = []
    let dataRows: string[][] = []
    let sheetParsed = 'Sheet1'
    let availableSheets: string[] = []

    // Excel-family extensions: try ExcelJS first, fall back to PapaParse on failure.
    // This handles .xlsx, .xlsm, .xls, .ods, etc. — anything ExcelJS can read works
    // natively; older binary formats (.xls) or unknown extensions fall through to text parsing.
    const isExcelFamily = ['xlsx', 'xlsm', 'xlsb', 'xltx', 'xltm', 'xls', 'ods'].includes(ext)
    let parsedViaExcel = false

    if (isExcelFamily) {
      try {
        const ExcelJS = await import('exceljs')
        const arrayBuffer = await file.arrayBuffer()
        const wb = new ExcelJS.default.Workbook()
        await wb.xlsx.load(arrayBuffer)

        availableSheets = wb.worksheets.map(ws => ws.name)
        if (availableSheets.length === 0) {
          return NextResponse.json({ error: 'No sheets found in workbook' }, { status: 400 })
        }

        sheetParsed = sheetParam || availableSheets[0]

        let ws = wb.getWorksheet(sheetParsed) ?? null
        if (!ws) {
          const idx = parseInt(sheetParam, 10)
          ws = (Number.isFinite(idx) ? wb.worksheets[idx] : null) ?? wb.worksheets[0] ?? null
          sheetParsed = ws?.name ?? availableSheets[0]
        }

        if (!ws) return NextResponse.json({ error: 'Sheet not found' }, { status: 400 })

        const raw: unknown[][] = []
        const colCount = Math.max(ws.columnCount, 1)
        ws.eachRow({ includeEmpty: false }, (row) => {
          const cells: unknown[] = []
          for (let c = 1; c <= colCount; c++) {
            const cell = row.getCell(c)
            let val: unknown = cell.value
            if (val && typeof val === 'object' && 'result' in (val as Record<string, unknown>)) {
              val = (val as { result: unknown }).result
            }
            if (val && typeof val === 'object' && 'richText' in (val as Record<string, unknown>)) {
              val = (val as { richText: Array<{ text: string }> }).richText.map(t => t.text).join('')
            }
            cells.push(val ?? '')
          }
          raw.push(cells)
        })

        if (!raw || raw.length < 2) {
          return NextResponse.json({ error: 'Sheet needs a header row and at least one data row', available_sheets: availableSheets }, { status: 400 })
        }

        const { headerIdx, groupIdx } = findHeaderRow(raw)
        headers = buildHeaders(raw, headerIdx, groupIdx).filter((_, i) => i < (raw[headerIdx] as unknown[]).length)
        dataRows = raw
          .slice(headerIdx + 1)
          .filter(row => (row as unknown[]).some(c => String(c ?? '').trim()))
          .map(row => (row as unknown[]).map(c => String(c ?? '').trim()))
        parsedViaExcel = true
      } catch {
        // ExcelJS could not read the file (e.g. legacy .xls binary) — fall through to text parsing.
      }
    }

    if (!parsedViaExcel) {
      // CSV, TSV, TXT, pipe-delimited, or any Excel format ExcelJS couldn't read.
      // PapaParse auto-detects the delimiter (comma, tab, semicolon, pipe).
      const text = await file.text()
      const { default: Papa } = await import('papaparse')
      const result = Papa.parse(text, { skipEmptyLines: true, delimiter: '' })
      const allRows = result.data as string[][]
      if (allRows.length < 2) return NextResponse.json({ error: 'File needs a header row and at least one data row' }, { status: 400 })
      availableSheets = ['Sheet1']
      sheetParsed = 'Sheet1'

      const { headerIdx, groupIdx } = findHeaderRow(allRows)
      headers = buildHeaders(allRows, headerIdx, groupIdx)
      dataRows = allRows.slice(headerIdx + 1).filter(row => row.some(c => c.trim()))
    }

    // ── Pivot detection ───────────────────────────────────────────────────────
    if (detectPivot(headers, dataRows)) {
      const pivotRows = parsePivot(headers, dataRows)
      if (pivotRows.length > 0) {
        // Go straight to aggregation with the transposed rows
        const catalog = await getCatalog(supabase)
        const outputRows: TradeTemplateRow[] = pivotRows.map(row => {
          const device = matchDeviceFromCsv(catalog, row.brand, row.model)
          return {
            make: row.brand || row.model,
            model: row.model,
            storage: row.storage,
            condition: row.condition,
            quantity: row.quantity,
            unit_price: row.customer_net ?? row.gross_price,
            serials: [],
            imeis: [],
            device_id: device?.id ?? null,
            match_status: (device ? 'matched' : 'not_in_catalog') as 'matched' | 'catalog_matched' | 'not_in_catalog',
          }
        })
        const finalRows = await autoAddUnmatched(outputRows, catalog)
        if (finalRows.some(r => r.match_status === 'auto_added')) invalidateCatalogCache()
        const matched = finalRows.filter(r => r.device_id).length
        const totalDevices = finalRows.reduce((s, r) => s + r.quantity, 0)
        return NextResponse.json({
          rows: finalRows,
          summary: {
            total_devices: totalDevices,
            matched,
            unmatched: finalRows.length - matched,
            total_value: null,
            format_type: 'batch',
            detected_columns: { 'pivot': 'transposed' },
            llm_assisted: false,
            sheet_parsed: sheetParsed,
          },
          available_sheets: availableSheets,
        })
      }
    }

    // ── Column mapping (standard flat table path) ─────────────────────────────
    const detectedColumns: Record<string, string> = {}
    const colIndex: Record<string, number> = {}
    let mappedCount = 0

    for (let i = 0; i < headers.length; i++) {
      const h = headers[i]
      if (!h) continue
      const canonical = mapColumn(h)
      if (canonical) {
        detectedColumns[h] = canonical
        if (!(canonical in colIndex)) colIndex[canonical] = i
        mappedCount++
      }
    }

    // Detect storage-as-column headers (e.g. "32 GB", "128 GB")
    const storageColMap = detectStorageColumns(headers)

    // LLM fallback when model column is missing OR less than 30% of columns mapped.
    // brand alone is NOT sufficient — without model there's nothing to match against.
    let llmAssisted = false
    const hasModel = 'model' in colIndex || 'product_number' in colIndex
    if (!hasModel || mappedCount < Math.ceil(headers.length * 0.3)) {
      const llmMap = await inferColumnsWithLLM(headers, dataRows.slice(0, 3))
      if (llmMap) {
        llmAssisted = true
        for (const [rawHeader, canonical] of Object.entries(llmMap)) {
          if (!canonical || canonical === 'ignore') continue
          const idx = headers.findIndex(h => h.toLowerCase().trim() === rawHeader.toLowerCase().trim())
          // Allow LLM to override model/brand even if already mapped (LLM has data context)
          const shouldOverride = canonical === 'model' || canonical === 'brand'
          if (idx >= 0 && (shouldOverride || !(canonical in colIndex))) {
            colIndex[canonical] = idx
            detectedColumns[rawHeader] = canonical
          }
        }
      }
    }

    // Last-resort: if model is STILL not found after LLM, pick the unmapped column
    // with the longest average text — device descriptions are almost always the longest
    // text column in a trade quote spreadsheet.
    if (!('model' in colIndex) && !('product_number' in colIndex)) {
      const mappedIndices = new Set(Object.values(colIndex))
      let bestCol = -1, bestAvgLen = 0
      for (let i = 0; i < headers.length; i++) {
        if (mappedIndices.has(i)) continue
        const vals = dataRows.slice(0, 10).map(r => (r[i] ?? '').trim()).filter(Boolean)
        if (vals.length === 0) continue
        const avgLen = vals.reduce((s, v) => s + v.length, 0) / vals.length
        // Exclude columns where values look like pure numbers (prices, quantities)
        const allNumeric = vals.every(v => /^[\d.,$ ]+$/.test(v))
        if (!allNumeric && avgLen > bestAvgLen) { bestAvgLen = avgLen; bestCol = i }
      }
      if (bestCol >= 0) {
        colIndex['model'] = bestCol
        detectedColumns[headers[bestCol]] = 'model (content-inferred)'
      }
    }

    // ── Extract rows ──────────────────────────────────────────────────────────
    const get = (cells: string[], field: string): string => {
      const idx = colIndex[field]
      return idx != null ? (cells[idx] ?? '').trim() : ''
    }

    const parsedRows: ParsedRow[] = []
    for (let i = 0; i < dataRows.length; i++) {
      const cells = dataRows[i]
      if (!cells || cells.every(c => !c)) continue

      let brand = get(cells, 'brand')
      let model = get(cells, 'model')
      let storage = get(cells, 'storage')
      const productNum = get(cells, 'product_number')  // e.g. Apple A1990 / A2141 identifier
      const screenSize = get(cells, 'screen_size')     // e.g. "15-inch", "16-inch"
      const yearVal = get(cells, 'year')

      // Handle storage-as-column: find which storage col has a non-empty price
      if (!storage && Object.keys(storageColMap).length > 0) {
        for (const [colIdxStr, storageTier] of Object.entries(storageColMap)) {
          const val = (cells[parseInt(colIdxStr)] ?? '').trim()
          if (val && parsePriceCell(val) !== null) {
            storage = storageTier
            break
          }
        }
      }

      // Build composite model name from Model + Screen Size + (Year) when available.
      // e.g. "MacBook Pro" + "15-inch" + "2018" → "MacBook Pro 15-inch (2018)"
      if (model) {
        if (screenSize && !model.toLowerCase().includes(screenSize.toLowerCase())) {
          model = `${model} ${screenSize}`
        }
        if (yearVal && !model.includes(`(${yearVal})`)) {
          model = `${model} (${yearVal})`
        }
      }

      // Fall back to product_number only when no dedicated model column was found
      if (!model && productNum) {
        model = productNum
      }

      // Handle combined make+model+storage+color in one column
      if (model && !brand) {
        const lower = model.toLowerCase()
        const looksLikeCombined = KNOWN_BRANDS.some(b => lower.startsWith(b))
          || lower.match(/\b(iphone|ipad|macbook|galaxy|pixel)\b/) !== null
          || (model.match(/\b\d+(GB|TB)\b/i) !== null && model.split(/\s+/).length >= 3)
        if (looksLikeCombined) {
          const split = splitCombinedField(model)
          if (split.brand) brand = split.brand
          if (split.storage && !storage) storage = split.storage
          model = split.model || model
        }
      }

      // Infer brand from model when no brand column exists
      if (!brand && model) {
        brand = inferBrand(model)
        // If brand was inferred from a model-name prefix, strip it from the model string
        if (brand && model.toLowerCase().startsWith(brand.toLowerCase())) {
          model = model.slice(brand.length).trim()
        }
      }

      const condRaw = get(cells, 'condition')
      const qtyRaw = get(cells, 'quantity')
      const parsedQtyNum = qtyRaw !== '' ? parseInt(qtyRaw, 10) : NaN
      const qty = !isNaN(parsedQtyNum) ? Math.max(0, parsedQtyNum) : 1

      parsedRows.push({
        brand: brand || '',
        model: model || '',
        storage: normalizeStorage(storage) || '',
        condition: normalizeTradeCondition(condRaw),
        quantity: qty,
        gross_price: parsePriceCell(get(cells, 'gross_price')),
        fair_price: parsePriceCell(get(cells, 'fair_price')),
        customer_net: parsePriceCell(get(cells, 'customer_net')),
        carrier_deduction: parsePriceCell(get(cells, 'carrier_deduction')),
        eg_deduction: parsePriceCell(get(cells, 'eg_deduction')),
        imei: get(cells, 'imei'),
        serial: get(cells, 'serial'),
        year: get(cells, 'year'),
        notes: get(cells, 'notes'),
      })
    }

    // Filter out rows with no device info.
    // Also exclude rows where model is a bare number (e.g. "0", "1") with no brand —
    // these are formatting artifacts from Excel cells that held a numeric value.
    // Rows with a brand but no model, or rows with an IMEI/serial but no model, are
    // kept and flagged with upload_notes so nothing from the customer file is silently dropped.
    const validRows = parsedRows.filter(r => {
      if (!r.brand && /^\d+$/.test((r.model ?? '').trim())) return false
      // Keep row if any meaningful identifier is present (brand, model, IMEI, serial)
      return r.brand || r.model || r.imei || r.serial
    })
    if (validRows.length === 0) {
      return NextResponse.json({
        error: 'No device rows found. Check that your file has Make/Model/Brand columns.',
        available_sheets: availableSheets,
      }, { status: 400 })
    }

    // ── Detect format type ────────────────────────────────────────────────────
    const hasSerials = validRows.some(r => r.serial || r.imei)
    const hasQty = 'quantity' in colIndex
    // If explicit qty > 1 exists anywhere, the file is batch-style even when IMEI column present.
    // A true per-device manifest always has qty=1 per row (one IMEI = one device).
    const hasExplicitQty = hasQty && validRows.some(r => r.quantity > 1)
    const formatType: 'batch' | 'per_device' | 'unknown' = hasExplicitQty ? 'batch' : hasSerials ? 'per_device' : hasQty ? 'batch' : 'unknown'

    // ── Fetch device catalog (cached 5 min per warm serverless instance) ────────
    const catalog = await getCatalog(supabase)

    // ── Aggregate + match ─────────────────────────────────────────────────────
    type AggKey = string
    type AggEntry = {
      make: string; model: string; storage: string; condition: string
      quantity: number; unit_price: number | null
      serials: string[]; imeis: string[]
    }

    const agg = new Map<AggKey, AggEntry>()

    for (const row of validRows) {
      if (row.condition === 'recycle') row.condition = 'poor' // Remap recycle → poor (lowest tier, not skipped)

      const isFair = row.condition === 'fair' || row.condition === 'poor'
      let unitPrice: number | null = row.customer_net
      if (!unitPrice) unitPrice = isFair ? (row.fair_price ?? row.gross_price) : row.gross_price

      const key: AggKey = `${row.brand.toLowerCase().trim()}|${row.model.toLowerCase().trim()}|${row.storage.toLowerCase().trim()}|${(row.condition || '').toLowerCase().trim()}`

      if (formatType === 'per_device') {
        const existing = agg.get(key)
        if (existing) {
          existing.quantity += 1
          if (row.imei) existing.imeis.push(row.imei)
          if (row.serial) existing.serials.push(row.serial)
          if (!existing.unit_price && unitPrice) existing.unit_price = unitPrice
        } else {
          agg.set(key, {
            make: row.brand, model: row.model, storage: row.storage,
            condition: row.condition, quantity: 1,
            unit_price: unitPrice,
            imeis: row.imei ? [row.imei] : [],
            serials: row.serial ? [row.serial] : [],
          })
        }
      } else {
        const existing = agg.get(key)
        if (existing) {
          existing.quantity += row.quantity
          if (!existing.unit_price && unitPrice) existing.unit_price = unitPrice
        } else {
          agg.set(key, {
            make: row.brand, model: row.model, storage: row.storage,
            condition: row.condition, quantity: row.quantity,
            unit_price: unitPrice, imeis: [], serials: [],
          })
        }
      }
    }

    // ── Match each aggregated row against catalog ─────────────────────────────
    const outputRows: TradeTemplateRow[] = []
    for (const entry of agg.values()) {
      const rowNotes: string[] = []
      if (entry.quantity === 0) rowNotes.push('Quantity was 0 in your file')
      if (!entry.model) rowNotes.push('Model not specified in your file')
      else if (!entry.make) rowNotes.push('Make/brand not specified in your file')

      const device = entry.model ? matchDeviceFromCsv(catalog, entry.make, entry.model) : null
      outputRows.push({
        make: entry.make || 'Unknown',
        model: entry.model,
        storage: entry.storage,
        condition: entry.condition,
        quantity: entry.quantity === 0 ? 0 : entry.quantity,
        unit_price: entry.unit_price,
        serials: entry.serials,
        imeis: entry.imeis,
        device_id: device?.id ?? null,
        match_status: (device ? 'matched' : 'not_in_catalog') as 'matched' | 'catalog_matched' | 'not_in_catalog',
        ...(rowNotes.length > 0 ? { upload_notes: rowNotes.join(' | ') } : {}),
      })
    }

    const finalRows = await autoAddUnmatched(outputRows, catalog)
    if (finalRows.some(r => r.match_status === 'auto_added')) invalidateCatalogCache()
    const matched = finalRows.filter(r => r.device_id).length
    const totalDevices = finalRows.reduce((s, r) => s + r.quantity, 0)
    const totalValue = finalRows.some(r => r.unit_price != null)
      ? finalRows.reduce((s, r) => s + (r.unit_price ?? 0) * r.quantity, 0)
      : null

    const summary: TradeTemplateSummary = {
      total_devices: totalDevices,
      matched,
      unmatched: finalRows.length - matched,
      total_value: totalValue ? Math.round(totalValue * 100) / 100 : null,
      format_type: formatType,
      detected_columns: detectedColumns,
      llm_assisted: llmAssisted,
      sheet_parsed: sheetParsed,
    }

    return NextResponse.json({ rows: finalRows, summary, available_sheets: availableSheets, rows_truncated: 0 })
  } catch (err) {
    console.error('[parse-trade-template]', err)
    return NextResponse.json({ error: 'Failed to parse file' }, { status: 500 })
  }
}
