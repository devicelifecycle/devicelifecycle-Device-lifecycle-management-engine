// ============================================================================
// ORDER CSV UPLOAD API ROUTE
// ============================================================================
// Auto-detects 3 CSV template formats:
//   1. Trade-In: Make, Model, Storage/GB, IMEI, Colour, Condition, Faults/Notes
//   2. CPO Request: Make, Model, Storage/GB, Condition, Quantity
//   3. Vendor Inventory: Product, Year, Model, Screen Size, CPU, RAM, Storage, Sample S/N, Accessories, Condition
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { sanitizeCsvCell } from '@/lib/utils'
import { DEVICE_CONDITION_VALUES } from '@/lib/validations'
export const dynamic = 'force-dynamic'


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
  'oem': 'brand',
  'company': 'brand',
  'phone brand': 'brand',
  'phone model': 'model',
  'device name': 'model',
  'device_name': 'model',
  // Storage aliases
  'gb': 'storage',
  'size': 'storage',
  'disk': 'storage',
  'hard drive': 'storage',
  'ssd': 'storage',
  // Price aliases (user may include a price column)
  'price': 'price',
  'unit_price': 'price',
  'unit price': 'price',
  'value': 'price',
  'amount': 'price',
  'cost': 'price',
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
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: userProfile } = await supabase
      .from('users')
      .select('role, organization_id')
      .eq('id', user.id)
      .single()

    if (!userProfile || !['admin', 'coe_manager', 'sales', 'customer'].includes(userProfile.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const body = await request.json()
    const { rows, columns, customer_id, order_type } = body as {
      rows: Record<string, string>[]
      columns?: string[]
      customer_id: string
      order_type?: 'trade_in' | 'cpo'
    }

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No data rows provided' }, { status: 400 })
    }

    if (rows.length > 1000) {
      return NextResponse.json({ error: 'Too many rows. Maximum 1,000 rows per upload.' }, { status: 400 })
    }

    if (!customer_id) {
      return NextResponse.json({ error: 'customer_id is required' }, { status: 400 })
    }

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(customer_id)) {
      return NextResponse.json({ error: 'Invalid customer_id format' }, { status: 400 })
    }

    const { data: customer } = await supabase
      .from('customers')
      .select('id, organization_id, is_active')
      .eq('id', customer_id)
      .single()

    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    if (!customer.is_active) return NextResponse.json({ error: 'Customer is inactive' }, { status: 400 })

    if (userProfile.role === 'customer') {
      if (!userProfile.organization_id || userProfile.organization_id !== customer.organization_id) {
        return NextResponse.json({ error: 'Cannot create orders for another organization' }, { status: 403 })
      }
    }

    if (userProfile.role === 'sales' && userProfile.organization_id && customer.organization_id) {
      if (customer.organization_id !== userProfile.organization_id) {
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

      // If no column mapping worked, fall back to raw keys with aliases
      let brand = sanitizeCsvCell(mapped.brand || rawRow.brand || rawRow.Brand || rawRow.make || rawRow.Make || rawRow['Make*'] || '')
      let model = sanitizeCsvCell(mapped.model || rawRow.model || rawRow.Model || rawRow['Model*'] || '')
      const storage = sanitizeCsvCell(mapped.storage || rawRow.storage || rawRow.Storage || rawRow['Storage/GB'] || rawRow['Storage/GB*'] || '')

      // Handle "Product" column (vendor inventory format)
      if (!brand && mapped.product) {
        const extracted = extractBrandFromProduct(mapped.product)
        brand = extracted.brand
        if (!model) model = extracted.model
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
      let quantity = Number(mapped.quantity || rawRow.quantity || rawRow.Quantity || rawRow.Qty || 0)
      if (templateType !== 'cpo' && (!quantity || quantity < 1)) {
        quantity = 1  // Per-device rows have implicit qty=1
      }

      // Validation
      if (!brand) errors.push({ row: i + 1, message: 'Make/Brand is required' })
      if (!model) errors.push({ row: i + 1, message: 'Model is required' })
      if (templateType === 'cpo' && (!quantity || quantity < 1)) {
        errors.push({ row: i + 1, message: 'Quantity is required for CPO orders' })
      }

      const yearStr = mapped.year || rawRow.year || rawRow.Year || ''
      const yearNum = yearStr ? parseInt(yearStr, 10) : undefined

      // Price: strip $ and commas, parse as number
      const rawPrice = sanitizeCsvCell(mapped.price || rawRow.price || rawRow.Price || rawRow['Unit Price'] || rawRow.unit_price || '')
      const parsedPrice = rawPrice ? parseFloat(rawPrice.replace(/[$,]/g, '')) : undefined

      normalizedRows.push({
        brand,
        model,
        storage: normalizeStorage(storage),
        condition: normalizedCondition,
        quantity: Math.max(1, quantity),
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
        notes: sanitizeCsvCell(mapped.notes || rawRow.notes || rawRow.Notes || ''),
        raw_condition: rawCondition || undefined,
      })
    }

    if (errors.length > 0) {
      return NextResponse.json(
        { error: 'Validation errors', details: errors },
        { status: 400 }
      )
    }

    // Determine order type
    const effectiveOrderType = order_type || (templateType === 'cpo' ? 'cpo' : 'trade_in')

    // Generate order number
    const { data: orderNumResult } = await supabase.rpc('generate_order_number')
    const orderNumber = orderNumResult || `${effectiveOrderType === 'cpo' ? 'CPO' : 'TI'}-${Date.now()}`

    const totalQuantity = normalizedRows.reduce((sum, row) => sum + row.quantity, 0)

    // Create order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        order_number: orderNumber,
        type: effectiveOrderType,
        status: 'draft',
        customer_id,
        created_by_id: user.id,
        total_quantity: totalQuantity,
        total_amount: 0,
      })
      .select()
      .single()

    if (orderError) throw orderError

    // Look up devices and create order items
    const orderItems = []
    for (const row of normalizedRows) {
      // Try to find matching device in catalog
      let deviceId: string | null = null

      // First try exact make + model match
      const { data: device } = await supabase
        .from('device_catalog')
        .select('id')
        .ilike('make', row.brand)
        .ilike('model', `%${row.model}%`)
        .limit(1)
        .single()

      deviceId = device?.id || null

      // Build the order item
      const item: Record<string, unknown> = {
        order_id: order.id,
        device_id: deviceId,
        quantity: row.quantity,
        storage: row.storage || null,
        claimed_condition: row.condition || null,
        notes: [row.notes, row.faults].filter(Boolean).join(' | ') || null,
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
      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems)

      if (itemsError) {
        console.error('Error creating order items:', itemsError)
      }
    }

    return NextResponse.json({
      order,
      template_detected: templateType,
      order_type: effectiveOrderType,
      items_created: orderItems.length,
      total_quantity: totalQuantity,
    }, { status: 201 })
  } catch (error) {
    console.error('Error uploading CSV:', error)
    return NextResponse.json(
      { error: 'Failed to process CSV upload' },
      { status: 500 }
    )
  }
}
