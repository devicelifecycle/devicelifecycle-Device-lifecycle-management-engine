// ============================================================================
// ORDER CSV UPLOAD API ROUTE
// ============================================================================
// Auto-detects 3 CSV template formats:
//   1. Trade-In: Make, Model, Storage/GB, IMEI, Colour, Condition, Faults/Notes
//   2. CPO Request: Make, Model, Storage/GB, Condition, Quantity
//   3. Vendor Inventory: Product, Year, Model, Screen Size, CPU, RAM, Storage, Sample S/N, Accessories, Condition
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import type { AuthContext } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { sanitizeCsvCell } from '@/lib/utils'
import { DEVICE_CONDITION_VALUES } from '@/lib/validations'
export const dynamic = 'force-dynamic'

function incrementOrderNumber(orderNumber: string): string {
  const match = /^(PO|INV)-(\d{4})-(\d+)$/.exec(orderNumber)
  if (!match) return orderNumber

  const [, prefix, year, serialRaw] = match
  const nextSerial = Number.parseInt(serialRaw, 10) + 1
  return `${prefix}-${year}-${String(nextSerial).padStart(Math.max(4, serialRaw.length), '0')}`
}

async function getNextOrderNumberFromTable(
  supabase: AuthContext['supabase'],
  direction: 'inbound' | 'outbound',
): Promise<string> {
  const prefix = direction === 'inbound' ? 'PO' : 'INV'
  const year = String(new Date().getFullYear())

  const { data } = await supabase
    .from('orders')
    .select('order_number')
    .like('order_number', `${prefix}-${year}-%`)

  let maxSerial = 0
  for (const row of data || []) {
    const orderNumber = row.order_number
    if (typeof orderNumber !== 'string') continue
    const match = new RegExp(`^${prefix}-${year}-(\\d+)$`).exec(orderNumber)
    if (!match) continue
    const parsed = Number.parseInt(match[1], 10)
    if (Number.isFinite(parsed) && parsed > maxSerial) {
      maxSerial = parsed
    }
  }

  return `${prefix}-${year}-${String(maxSerial + 1).padStart(4, '0')}`
}


type TemplateType = 'trade_in' | 'cpo' | 'vendor_inventory'

// Column name aliases → canonical field names (includes common typos for auto-correction)
const COLUMN_MAP: Record<string, string> = {
  // Brand / Make
  'make': 'brand',
  'make*': 'brand',
  'brand': 'brand',
  'manufacturer': 'brand',
  'device_make': 'brand',
  'devcie_make': 'brand',
  'divice_make': 'brand',
  'device make': 'brand',
  // Model
  'model': 'model',
  'model*': 'model',
  'device': 'model',
  'device_model': 'model',
  'devcie_model': 'model',
  'divice_model': 'model',
  'device model': 'model',
  'product': 'product',  // special: parse brand from "MacBook Pro 16-inch"
  // Storage
  'storage': 'storage',
  'storage/gb': 'storage',
  'storage/gb*': 'storage',
  'capacity': 'storage',
  // Condition
  'condition': 'condition',
  // Quantity
  'quantity': 'quantity',
  'qty': 'quantity',
  // IMEI
  'imei': 'imei',
  // Serial number
  'serial_number': 'serial_number',
  'serial': 'serial_number',
  'sample s/n': 'serial_number',
  's/n': 'serial_number',
  'sn': 'serial_number',
  // Colour
  'colour': 'colour',
  'color': 'colour',
  // Faults / Notes
  'faults/notes': 'faults',
  'faults': 'faults',
  'fault': 'faults',
  'notes': 'notes',
  // Extended metadata
  'year': 'year',
  'cpu': 'cpu',
  'processor': 'cpu',
  'ram': 'ram',
  'memory': 'ram',
  'screen size': 'screen_size',
  'screen': 'screen_size',
  'display': 'screen_size',
  'model number': 'model_number',
  'accessories': 'accessories',
  'accessories. ex., charger?': 'accessories',
  // Common typos (auto-correction)
  'condtion': 'condition',
  'condiiton': 'condition',
  'conditon': 'condition',
  'conidtion': 'condition',
  'storag': 'storage',
  'storrage': 'storage',
  'storgae': 'storage',
  'stroge': 'storage',
  'quantitty': 'quantity',
  'quantiy': 'quantity',
  'qantity': 'quantity',
  'colur': 'colour',
  'coluur': 'colour',
  'serial_numbr': 'serial_number',
  'serail_number': 'serial_number',
  'seria_number': 'serial_number',
  'serialnumber': 'serial_number',
  'nots': 'notes',
  // Brand/make aliases for user-created templates
  'oem': 'brand', 'mfr': 'brand', 'vendor': 'brand', 'supplier': 'brand',
  'company': 'brand', 'phone brand': 'brand', 'phone make': 'brand',
  'device brand': 'brand', 'device manufacturer': 'brand',
  'phone_brand': 'brand', 'phone_make': 'brand',
  // Model aliases — universal: device description, asset, SKU, equipment, etc.
  'phone model': 'model', 'model name': 'model', 'existing phone': 'model',
  'device name': 'model', 'device_name': 'model', 'description': 'model',
  'device description': 'model', 'item description': 'model',
  'product description': 'model', 'asset description': 'model',
  'product name': 'model', 'item name': 'model', 'asset name': 'model',
  'equipment description': 'model', 'hardware description': 'model',
  'sku': 'model', 'sku description': 'model', 'part description': 'model',
  'part name': 'model', 'equipment name': 'model', 'equipment model': 'model',
  'unit description': 'model', 'article description': 'model',
  // Quantity aliases
  'count': 'quantity', 'num': 'quantity', '#': 'quantity',
  'device count': 'quantity', 'count of mobile': 'quantity', 'volume': 'quantity',
  'unit count': 'quantity', 'units': 'quantity', 'no of units': 'quantity',
  'number of units': 'quantity', 'total units': 'quantity', 'total devices': 'quantity',
  // Storage aliases
  'gb': 'storage', 'size': 'storage', 'disk': 'storage', 'hard drive': 'storage', 'ssd': 'storage',
  'storage capacity': 'storage', 'disk size': 'storage', 'drive size': 'storage',
  'internal storage': 'storage', 'device storage': 'storage', 'memory size': 'storage',
  // Serial / asset tag aliases
  'asset tag': 'serial_number', 'asset #': 'serial_number', 'asset number': 'serial_number',
  'device id': 'serial_number', 'barcode': 'serial_number',
  'sim card': 'serial_number', 'sim': 'serial_number',
  // Price aliases (user may include a price column)
  'price': 'price', 'unit_price': 'price', 'unit price': 'price',
  'value': 'price', 'amount': 'price', 'cost': 'price',
}

// Levenshtein distance for fuzzy column matching
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      )
    }
  }
  return dp[m][n]
}

// Auto-correct column header typos: exact match first, then fuzzy (≤2 edits)
function autoCorrectColumn(header: string): string | undefined {
  const lower = header.toLowerCase().trim().replace(/\s+/g, ' ')
  if (COLUMN_MAP[lower]) return COLUMN_MAP[lower]
  const keys = Object.keys(COLUMN_MAP)
  let best: { key: string; dist: number } | null = null
  for (const k of keys) {
    const d = levenshtein(lower, k)
    if (d <= 2 && (!best || d < best.dist)) best = { key: k, dist: d }
  }
  return best ? COLUMN_MAP[best.key] : undefined
}

// Condition value typos → canonical (auto-correction for template cell values)
const CONDITION_TYPO_MAP: Record<string, string> = {
  excellant: 'excellent', exacellent: 'excellent', exellent: 'excellent', excelent: 'excellent',
  execellent: 'excellent', excellen: 'excellent', excellet: 'excellent',
  gud: 'good', gd: 'good', goood: 'good', god: 'good',
  fr: 'fair', average: 'fair', fiar: 'fair', fai: 'fair',
  brokn: 'poor', broke: 'poor', broken: 'poor', damag: 'poor', crack: 'poor',
  por: 'poor', pooor: 'poor', bad: 'poor', damaged: 'poor', cracked: 'poor',
  nw: 'new', nwe: 'new', sealed: 'new', unopened: 'new', brandnew: 'new',
  likenew: 'excellent', lknew: 'excellent', asnew: 'excellent',
  grade_a: 'excellent', gradea: 'excellent',
  grade_b: 'good', gradeb: 'good',
  grade_c: 'fair', gradec: 'fair',
  grade_d: 'poor', graded: 'poor',
}

// Order: check worst conditions first (poor→fair) before better ones (good→excellent→new)
// to avoid false positives like "battery worn" matching "new" via substring
function normalizeCondition(raw: string): string | null {
  if (!raw) return null
  const lower = raw.toLowerCase().trim()
  const token = lower.replace(/[^a-z]/g, '')

  // Typo auto-correction (excellant → excellent, etc.)
  if (CONDITION_TYPO_MAP[token]) return CONDITION_TYPO_MAP[token]

  // Direct enum match
  if (DEVICE_CONDITION_VALUES.includes(lower as (typeof DEVICE_CONDITION_VALUES)[number])) return lower

  // Check worst → best (free-text substring matching) to avoid substring false positives
  if (lower.includes('cracked') || lower.includes('broken') || lower.includes('damaged')) return 'poor'
  if (lower.includes('battery') || lower.includes('scratch') || lower.includes('worn') || lower.includes('fair')) return 'fair'
  if (lower.includes('good') || lower.includes('reset and cleaned') || lower.includes('clean')) return 'good'
  // "like new" and "mint" must be checked before bare "new"
  if (lower.includes('like new') || lower.includes('excellent') || lower.includes('mint')) return 'excellent'
  if (lower.includes('new') || lower.includes('sealed') || lower.includes('unopened')) return 'new'

  return null // Couldn't map — will store raw text in faults/notes
}

// Normalize storage to canonical form: "256 gb" → "256GB", "1 tb" → "1TB", "1024" → "1TB"
function normalizeStorage(raw: string): string {
  if (!raw) return ''
  let s = raw.trim()
  // Strip units and whitespace: "256 GB" → "256", "1 TB" → "1"
  const tbMatch = s.match(/^(\d+)\s*tb$/i)
  if (tbMatch) return `${tbMatch[1]}TB`
  const gbMatch = s.match(/^(\d+)\s*(?:gb|g)?$/i)
  if (gbMatch) {
    const num = parseInt(gbMatch[1], 10)
    // Convert large GB values to TB
    if (num === 1024) return '1TB'
    if (num === 2048) return '2TB'
    if (num === 4096) return '4TB'
    if (num === 8192) return '8TB'
    return `${num}GB`
  }
  return s
}

// Extract brand from product string like "MacBook Pro 16-inch"
function extractBrandFromProduct(product: string): { brand: string; model: string } {
  const lower = product.toLowerCase()
  if (lower.includes('macbook') || lower.includes('iphone') || lower.includes('ipad') || lower.includes('apple watch')) {
    return { brand: 'Apple', model: product }
  }
  if (lower.includes('galaxy') || lower.includes('samsung')) {
    return { brand: 'Samsung', model: product.replace(/samsung\s*/i, '') }
  }
  if (lower.includes('pixel') || lower.includes('google')) {
    return { brand: 'Google', model: product.replace(/google\s*/i, '') }
  }
  if (lower.includes('surface') || lower.includes('microsoft')) {
    return { brand: 'Microsoft', model: product }
  }
  if (lower.includes('thinkpad') || lower.includes('lenovo')) {
    return { brand: 'Lenovo', model: product }
  }
  if (lower.includes('dell') || lower.includes('latitude') || lower.includes('xps')) {
    return { brand: 'Dell', model: product }
  }
  if (lower.includes('hp') || lower.includes('elitebook') || lower.includes('probook')) {
    return { brand: 'HP', model: product }
  }
  // Fallback: first word is brand
  const parts = product.trim().split(/\s+/)
  return { brand: parts[0], model: parts.slice(1).join(' ') || parts[0] }
}

// Detect template type from column headers (with typo tolerance)
function detectTemplate(columns: string[]): TemplateType {
  const lowerCols = columns.map(c => c.toLowerCase().trim())
  const hasCol = (names: string[]) => (c: string) => names.includes(c) || names.some(n => levenshtein(c, n) <= 2)

  // Vendor inventory: has Product + Year + CPU/RAM columns
  if (lowerCols.some(hasCol(['product', 'produt', 'produkt'])) &&
      (lowerCols.some(hasCol(['cpu', 'processor', 'proc'])) || lowerCols.some(hasCol(['ram', 'memory', 'mem'])))) {
    return 'vendor_inventory'
  }

  // CPO: has Quantity column
  if (lowerCols.some(hasCol(['quantity', 'qty', 'quantitty', 'quantiy', 'quantit']))) {
    return 'cpo'
  }

  return 'trade_in'
}

// Map raw column headers to canonical field names (with typo auto-correction)
function mapColumns(columns: string[]): Record<number, string> {
  const mapping: Record<number, string> = {}
  for (let i = 0; i < columns.length; i++) {
    const canonical = autoCorrectColumn(columns[i])
    if (canonical) mapping[i] = canonical
  }
  return mapping
}

// Convert a raw row to a canonical record using column mapping
function mapRow(rawRow: Record<string, string>, columns: string[], colMap: Record<number, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (let i = 0; i < columns.length; i++) {
    const fieldName = colMap[i]
    if (fieldName) {
      const value = rawRow[columns[i]] || ''
      result[fieldName] = value.trim()
    }
  }
  return result
}

interface NormalizedRow {
  brand: string
  model: string
  storage: string
  condition: string | null
  quantity: number
  preresolved_device_id?: string | null  // device_id from parse step — skip re-matching when present
  imei?: string
  serial_number?: string
  colour?: string
  cpu?: string
  ram?: string
  screen_size?: string
  year?: number
  model_number?: string
  accessories?: string
  faults?: string
  notes?: string
  price?: number
  raw_condition?: string  // original free-text if condition couldn't be mapped
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    const body = await request.json()
    const { rows, columns, customer_id, order_type, skip_invalid_rows } = body as {
      rows: Record<string, string>[]
      columns?: string[]
      customer_id: string
      order_type?: 'trade_in' | 'cpo'
      skip_invalid_rows?: boolean
    }

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No data rows provided' }, { status: 400 })
    }

    if (!customer_id) {
      return NextResponse.json({ error: 'customer_id is required' }, { status: 400 })
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(customer_id)) {
      return NextResponse.json({ error: 'Invalid customer_id format' }, { status: 400 })
    }

    // Use service role for the customers lookup so that RLS restrictions on
    // the customers table don't block customer-role users from reading their own record.
    const serviceRole = createServiceRoleClient()
    const { data: customer } = await serviceRole
      .from('customers')
      .select('id, organization_id, is_active')
      .eq('id', customer_id)
      .single()

    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    if (!customer.is_active) return NextResponse.json({ error: 'Customer is inactive' }, { status: 400 })

    if (profile.role === 'customer') {
      if (!profile.organization_id) {
        return NextResponse.json({ error: 'Your account is not linked to an organization. Please contact your administrator.' }, { status: 403 })
      }
      if (profile.organization_id !== customer.organization_id) {
        return NextResponse.json({ error: 'Cannot create orders for another organization' }, { status: 403 })
      }
    }

    if (profile.role === 'sales' && profile.organization_id && customer.organization_id) {
      if (customer.organization_id !== profile.organization_id) {
        return NextResponse.json({ error: 'Cannot create orders for customers in another organization' }, { status: 403 })
      }
    }

    // Detect column headers
    const detectedColumns = columns || Object.keys(rows[0])
    const templateType = detectTemplate(detectedColumns)
    const colMap = mapColumns(detectedColumns)

    // Normalize all rows
    const errors: { row: number; message: string }[] = []
    const normalizedRows: NormalizedRow[] = []

    for (let i = 0; i < rows.length; i++) {
      const rawRow = rows[i]
      const mapped = mapRow(rawRow, detectedColumns, colMap)

      // If no column mapping worked, fall back to raw keys with aliases.
      // device_make / device_model are the canonical keys sent by the unified new order page.
      let brand = sanitizeCsvCell(mapped.brand || rawRow.brand || rawRow.Brand || rawRow.make || rawRow.Make || rawRow['Make*'] || rawRow.device_make || rawRow.oem || rawRow.OEM || rawRow.vendor || rawRow.Vendor || '')
      let model = sanitizeCsvCell(mapped.model || rawRow.model || rawRow.Model || rawRow['Model*'] || rawRow.device_model || '')
      const storage = sanitizeCsvCell(mapped.storage || rawRow.storage || rawRow.Storage || rawRow['Storage/GB'] || rawRow['Storage/GB*'] || '')

      // Handle "Product" column (vendor inventory format)
      if (!brand && mapped.product) {
        const extracted = extractBrandFromProduct(mapped.product)
        brand = extracted.brand
        if (!model) model = extracted.model
      }

      // Infer brand from model when make/brand column was missing or unrecognized
      if (!brand && model) {
        const lower = model.toLowerCase()
        if (lower.match(/\b(iphone|ipad|macbook|imac|airpods|apple watch|apple)\b/)) { brand = 'Apple' }
        else if (lower.match(/\b(galaxy|samsung)\b/)) { brand = 'Samsung'; model = model.replace(/^samsung\s+/i, '') }
        else if (lower.match(/\b(pixel|google)\b/)) { brand = 'Google'; model = model.replace(/^google\s+/i, '') }
        else if (lower.match(/\b(moto[a-z]*|motorola)\b/)) { brand = 'Motorola'; model = model.replace(/^motorola\s+/i, '') }
        else if (lower.match(/\bsonim\b/)) { brand = 'Sonim' }
        else if (lower.match(/\b(surface|microsoft)\b/)) { brand = 'Microsoft' }
        else if (lower.match(/\b(thinkpad|ideapad|yoga|lenovo)\b/)) { brand = 'Lenovo' }
        else if (lower.match(/\b(dell|latitude|xps|inspiron|alienware)\b/)) { brand = 'Dell' }
        else if (lower.match(/\b(kyocera)\b/)) { brand = 'Kyocera' }
        else if (lower.match(/\bnokia\b/)) { brand = 'Nokia'; model = model.replace(/^nokia\s+/i, '') }
        else if (lower.match(/\b(blackberry)\b/)) { brand = 'BlackBerry'; model = model.replace(/^blackberry\s+/i, '') }
        else if (lower.match(/\b(lg\s|lg-|lm-|stylo|velvet|wing)\b/)) { brand = 'LG'; model = model.replace(/^lg\s+/i, '') }
        else if (lower.match(/\b(oneplus|one plus)\b/)) { brand = 'OnePlus'; model = model.replace(/^oneplus\s+/i, '') }
        else if (lower.match(/\b(xperia|sony)\b/)) { brand = 'Sony'; model = model.replace(/^sony\s+/i, '') }
        else if (lower.match(/\b(elitebook|probook|spectre|envy|pavilion|omen|hp\s|hp-)\b/)) { brand = 'HP' }
        else if (lower.match(/\b(zenbook|vivobook|rog|asus)\b/)) { brand = 'Asus'; model = model.replace(/^asus\s+/i, '') }
        else if (lower.match(/\b(aspire|swift|predator|acer)\b/)) { brand = 'Acer' }
        else if (lower.match(/\b(huawei|p\d+\s*pro|mate\s*\d|nova\s*\d)\b/)) { brand = 'Huawei'; model = model.replace(/^huawei\s+/i, '') }
        else if (lower.match(/\b(xiaomi|redmi|poco)\b/)) { brand = 'Xiaomi'; model = model.replace(/^xiaomi\s+/i, '') }
        else if (lower.match(/\b(tcl)\b/)) { brand = 'TCL'; model = model.replace(/^tcl\s+/i, '') }
        else if (lower.match(/\b(alcatel)\b/)) { brand = 'Alcatel'; model = model.replace(/^alcatel\s+/i, '') }
        else if (lower.match(/\b(zte|blade|axon)\b/)) { brand = 'ZTE'; model = model.replace(/^zte\s+/i, '') }
        else {
          // Try first-word brand split (e.g. "Apple iPhone 15" → brand=Apple, model=iPhone 15)
          const KNOWN = ['Apple','Samsung','Google','Motorola','LG','Sony','OnePlus','Sonim','Kyocera','BlackBerry','Microsoft','Lenovo','Dell','HP','Asus','Acer','Huawei','Xiaomi','Nokia','Alcatel','TCL','ZTE','Netgear','Novatel','Inseego']
          const firstWord = model.trim().split(/\s+/)[0] ?? ''
          const matched = KNOWN.find(b => b.toLowerCase() === firstWord.toLowerCase())
          if (matched) { brand = matched; model = model.slice(firstWord.length).trim() || model }
          else { brand = 'Unknown' }  // Cannot infer — set Unknown so import doesn't fail
        }
      }

      // Condition: try to normalize to enum, store raw text if not mappable
      const rawCondition = sanitizeCsvCell(mapped.condition || rawRow.condition || rawRow.Condition || '')
      const faults = sanitizeCsvCell(mapped.faults || rawRow['Faults/Notes'] || rawRow.faults || rawRow.Faults || '')
      // Try condition column first; if empty/unmappable, derive from faults text
      const normalizedCondition = normalizeCondition(rawCondition) || normalizeCondition(faults)

      // If condition is free text and couldn't be normalized, store it in faults
      const effectiveFaults = (!normalizedCondition && rawCondition)
        ? [faults, rawCondition].filter(Boolean).join(' | ')
        : faults

      // Quantity: default to 1 for trade-in/inventory (per-device rows)
      const qtyStr = mapped.quantity || rawRow.quantity || rawRow.Quantity || rawRow.Qty || ''
      const rawQtyNum = qtyStr !== '' ? Number(qtyStr) : NaN
      const isExplicitZero = !isNaN(rawQtyNum) && rawQtyNum === 0
      let quantity = !isNaN(rawQtyNum) && rawQtyNum > 0 ? Math.round(rawQtyNum) : 0
      if (templateType !== 'cpo' && quantity < 1 && !isExplicitZero) {
        quantity = 1  // Per-device rows have implicit qty=1
      }
      // quantity=0 rows: DB uses qty=1 with an [Original qty: 0] note; not a hard error

      // Brand defaults to 'Unknown' when inference fails — never block the import.
      // Missing model is the only remaining hard error (nothing to match against catalog).
      if (!model) errors.push({ row: i + 1, message: 'Model is required' })
      // Flag 'Unknown' brand rows so admin can review and correct after import
      const unknownBrandNote = (brand === 'Unknown' || !brand) ? '⚠ Brand unknown — needs admin review' : ''

      const yearStr = mapped.year || rawRow.year || rawRow.Year || ''
      const yearNum = yearStr ? parseInt(yearStr, 10) : undefined

      // Price: strip $ and commas, parse as number
      const rawPrice = sanitizeCsvCell(mapped.price || rawRow.price || rawRow.Price || rawRow['Unit Price'] || rawRow.unit_price || '')
      const parsedPrice = rawPrice ? parseFloat(rawPrice.replace(/[$,]/g, '')) : undefined

      // Accept a pre-resolved device_id from the parse step so we don't re-match
      // with the weaker ILIKE query and risk returning the wrong catalog entry.
      // Validate UUID format before trusting the value so an invalid string doesn't
      // cause a silent FK violation when inserting order_items.
      const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      const rawDeviceId = rawRow.device_id
      const preresolvedId = rawDeviceId && typeof rawDeviceId === 'string' && UUID_RE.test(rawDeviceId)
        ? rawDeviceId
        : null

      normalizedRows.push({
        brand,
        model,
        storage: normalizeStorage(storage),
        condition: normalizedCondition,
        quantity: Math.max(1, quantity),
        preresolved_device_id: preresolvedId,
        price: parsedPrice && !isNaN(parsedPrice) && parsedPrice > 0 ? parsedPrice : undefined,
        imei: sanitizeCsvCell(mapped.imei || rawRow.imei || rawRow.IMEI || ''),
        serial_number: sanitizeCsvCell(mapped.serial_number || rawRow.serial_number || rawRow['Sample S/N'] || rawRow['S/N'] || rawRow.Serial || ''),
        colour: sanitizeCsvCell(mapped.colour || rawRow.colour || rawRow.Colour || rawRow.color || rawRow.Color || ''),
        cpu: sanitizeCsvCell(mapped.cpu || rawRow.cpu || rawRow.CPU || rawRow.Processor || ''),
        ram: sanitizeCsvCell(mapped.ram || rawRow.ram || rawRow.RAM || rawRow.Memory || ''),
        screen_size: sanitizeCsvCell(mapped.screen_size || rawRow['Screen Size'] || rawRow.screen_size || rawRow.Screen || ''),
        year: yearNum && yearNum > 1990 && yearNum < 2100 ? yearNum : undefined,
        model_number: sanitizeCsvCell(mapped.model_number || rawRow['Model Number'] || ''),
        accessories: sanitizeCsvCell(mapped.accessories || rawRow.accessories || rawRow.Accessories || rawRow['Accessories. Ex., Charger?'] || ''),
        faults: effectiveFaults || undefined,
        notes: [isExplicitZero ? '[Original qty: 0]' : '', unknownBrandNote, sanitizeCsvCell(mapped.notes || rawRow.notes || rawRow.Notes || '')].filter(Boolean).join(' | '),
        raw_condition: rawCondition || undefined,
      })
    }

    if (errors.length > 0) {
      if (!skip_invalid_rows) {
        return NextResponse.json(
          { error: 'Validation errors', details: errors },
          { status: 400 }
        )
      }
      // Admin override: drop invalid rows and continue with valid ones
      const invalidIndices = new Set(errors.map(e => e.row - 1))
      const validRows = normalizedRows.filter((_, i) => !invalidIndices.has(i))
      if (validRows.length === 0) {
        return NextResponse.json(
          { error: 'No valid rows to process', details: errors },
          { status: 400 }
        )
      }
      normalizedRows.splice(0, normalizedRows.length, ...validRows)
    }

    // Determine order type
    const effectiveOrderType = order_type || (templateType === 'cpo' ? 'cpo' : 'trade_in')

    if (profile.role === 'sales' && effectiveOrderType === 'cpo') {
      return NextResponse.json(
        { error: 'Sales can create trade-in orders only' },
        { status: 403 }
      )
    }

    const direction = effectiveOrderType === 'cpo' ? 'outbound' : 'inbound'
    const totalQuantity = normalizedRows.reduce((sum, row) => sum + row.quantity, 0)

    // Create order with retry on duplicate order_number (race-condition guard)
    // Use service role for all write operations so customer-role RLS doesn't block inserts.
    const MAX_ATTEMPTS = 5
    let order: Record<string, unknown> | null = null
    let lastConflictedOrderNumber: string | null = null
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const { data: orderNumResult } = await serviceRole.rpc('generate_order_number', { direction })
      let orderNumber = orderNumResult || `${effectiveOrderType === 'cpo' ? 'CPO' : 'TI'}-${Date.now()}`

      if (lastConflictedOrderNumber && orderNumber === lastConflictedOrderNumber) {
        orderNumber = await getNextOrderNumberFromTable(serviceRole, direction)
        if (orderNumber === lastConflictedOrderNumber) {
          orderNumber = incrementOrderNumber(lastConflictedOrderNumber)
        }
      }

      const { data: createdOrder, error: orderError } = await serviceRole
        .from('orders')
        .insert({
          order_number: orderNumber,
          type: effectiveOrderType,
          order_direction: direction,
          status: 'draft',
          customer_id,
          created_by_id: authUser.id,
          total_quantity: totalQuantity,
          total_amount: 0,
        })
        .select()
        .single()

      if (!orderError && createdOrder) {
        order = createdOrder as Record<string, unknown>
        break
      }

      // Retry only on unique constraint violation for order_number
      const isConflict =
        orderError?.code === '23505' &&
        [orderError.message, orderError.details, orderError.hint]
          .filter(Boolean).join(' ').toLowerCase()
          .includes('order_number')

      if (!isConflict || attempt === MAX_ATTEMPTS) {
        throw orderError || new Error('Failed to create order')
      }

      lastConflictedOrderNumber = String(orderNumber)
    }

    if (!order) throw new Error('Failed to create order')

    // Look up devices and create order items
    const orderItems = []
    for (const row of normalizedRows) {
      let deviceId: string | null = null

      if (row.preresolved_device_id) {
        // Parse step already matched the device — trust that result rather than
        // re-running the weaker ILIKE substring query which can return a wrong row.
        deviceId = row.preresolved_device_id
      } else {
        // No pre-resolved ID — fall back to exact make + model substring search.
        const { data: device } = await serviceRole
          .from('device_catalog')
          .select('id')
          .ilike('make', row.brand)
          .ilike('model', row.model)  // exact match, not substring
          .limit(1)
          .single()
        deviceId = device?.id || null

        // Auto-add device to catalog when not found so future lookups succeed
        if (!deviceId && (row.brand || row.model)) {
          const autoMake = row.brand || 'Unknown'
          const autoModel = row.model || 'Unknown Model'
          try {
            const { data: newDevice } = await serviceRole
              .from('device_catalog')
              .insert({ make: autoMake, model: autoModel, is_active: true })
              .select('id')
              .single()
            deviceId = newDevice?.id || null
          } catch {
            // May already exist from a concurrent insert — retry lookup
            const { data: existingDevice } = await serviceRole
              .from('device_catalog')
              .select('id')
              .ilike('make', autoMake)
              .ilike('model', autoModel)
              .limit(1)
              .maybeSingle()
            deviceId = existingDevice?.id || null
          }
        }
      }

      // When catalog match still failed (auto-add also failed), embed the raw device name in notes
      // so the quote email can display it instead of showing a blank.
      const deviceNameTag = !deviceId && (row.brand || row.model)
        ? `[Device: ${[row.brand, row.model].filter(Boolean).join(' ')}]`
        : null

      // Build the order item
      const item: Record<string, unknown> = {
        order_id: order.id,
        device_id: deviceId,
        quantity: row.quantity,
        storage: row.storage || null,
        claimed_condition: row.condition || null,
        notes: [deviceNameTag, row.notes, row.faults].filter(Boolean).join(' | ') || null,
      }

      // Add extended fields if present
      if (row.imei) item.imei = row.imei
      if (row.serial_number) item.serial_number = row.serial_number
      if (row.colour) item.colour = row.colour
      if (row.cpu) item.cpu = row.cpu
      if (row.ram) item.ram = row.ram
      if (row.screen_size) item.screen_size = row.screen_size
      if (row.year) item.year = row.year
      if (row.model_number) item.model_number = row.model_number
      if (row.accessories) item.accessories = row.accessories
      if (row.faults) item.faults = row.faults
      if (row.price) item.unit_price = row.price

      orderItems.push(item)
    }

    if (orderItems.length > 0) {
      const { error: itemsError } = await serviceRole
        .from('order_items')
        .insert(orderItems)

      if (itemsError) {
        console.error('Error creating order items:', itemsError)
        return NextResponse.json({ error: 'Order created but failed to save line items. Please add them manually.' }, { status: 500 })
      }
    }

    return NextResponse.json({
      order,
      template_detected: templateType,
      order_type: effectiveOrderType,
      items_created: orderItems.length,
      total_quantity: totalQuantity,
      ...(errors.length > 0 && skip_invalid_rows ? { skipped_rows: errors.length, skipped_details: errors } : {}),
    }, { status: 201 })
  } catch (error) {
    console.error('Error uploading CSV:', error)
    return NextResponse.json(
      { error: 'Failed to process CSV upload' },
      { status: 500 }
    )
  }
}
