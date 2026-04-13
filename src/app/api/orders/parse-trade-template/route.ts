// ============================================================================
// TRADE TEMPLATE PARSER API
// POST /api/orders/parse-trade-template
// Accepts customer trade quote files in any format (Excel/CSV).
// Auto-detects columns, normalises conditions, matches devices against catalog,
// and aggregates per-device rows into order items.
// Does NOT write to DB — the client submits matched rows separately.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { matchDeviceFromCsv } from '@/lib/device-match'
import { normalizeTradeCondition } from '@/lib/condition'
import type { Device } from '@/types'

export const dynamic = 'force-dynamic'

// ── Column aliases covering all trade quote formats seen in the wild ─────────
const TRADE_COLUMN_MAP: Record<string, string> = {
  // Device identification
  'make': 'brand', 'brand': 'brand', 'manufacturer': 'brand', 'oem': 'brand',
  'mfr': 'brand', 'vendor': 'brand',
  'model': 'model', 'device': 'model', 'device model': 'model', 'device_model': 'model',
  'model name': 'model', 'phone model': 'model', 'product': 'model',
  'description': 'model', 'existing phone': 'model',

  // Storage
  'storage': 'storage', 'capacity': 'storage', 'gb': 'storage',
  'storage/gb': 'storage', 'memory': 'storage',

  // Condition (many customer aliases)
  'condition': 'condition', 'grade': 'condition', 'condtion': 'condition',
  'condiiton': 'condition', 'device condition': 'condition',
  'condition of device': 'condition', 'state': 'condition',

  // Quantity
  'quantity': 'quantity', 'qty': 'quantity', 'count': 'quantity',
  'count of mobile': 'quantity', 'total': 'quantity', 'num': 'quantity',
  '#': 'quantity', 'device count': 'quantity',

  // Pricing — customer net is the canonical price
  'customer': 'customer_net', 'net customer': 'customer_net',
  'customer net': 'customer_net', 'net': 'customer_net',
  'customer quote': 'customer_net', 'bridge': 'customer_net',

  // Gross / market price
  'gross': 'gross_price', 'value': 'gross_price', 'gross price': 'gross_price',
  'total good': 'gross_price', 'good': 'gross_price', '30 good': 'gross_price',
  '30d good': 'gross_price', 'good working (gross)': 'gross_price',
  'price': 'gross_price', 'unit price': 'gross_price', 'per unit': 'gross_price',
  'est value': 'gross_price', 'suggested': 'gross_price', 'quote': 'gross_price',
  'tdsynnex offer per unit': 'gross_price',

  // Fair-condition pricing (batch summary sheets)
  'fair': 'fair_price', '30 fair': 'fair_price', '30d fair': 'fair_price',
  'total fair': 'fair_price',

  // Carrier / spiff deductions
  'bell': 'carrier_deduction', 'spiff': 'carrier_deduction',
  'carrier spiff': 'carrier_deduction', 'rogers': 'carrier_deduction',

  // EG / processing fee
  'eg': 'eg_deduction', 'evergreen': 'eg_deduction', 'fee': 'eg_deduction',
  'processing': 'eg_deduction',

  // Per-device identifiers
  'imei': 'imei', 'imei/serial': 'imei', 'imei / serial': 'imei',
  'serial': 'serial', 'serial number': 'serial', 'serial_number': 'serial',
  's/n': 'serial', 'sn': 'serial', 'sample s/n': 'serial',

  // Extras
  'color': 'color', 'colour': 'color',
  'accessories': 'accessories', 'accessories/adapters': 'accessories',
  'accessories. ex., charger?': 'accessories',
  'notes': 'notes', 'comments': 'notes', 'faults': 'notes',
  'year': 'year', 'cpu': 'cpu', 'ram': 'ram', 'screen size': 'screen_size',
  'battery': 'battery', 'battery health': 'battery', 'battery %': 'battery',
}

// Condition normalisation — delegates to src/lib/condition.ts (shared with validations)
function normalizeCondition(raw: string): string {
  return normalizeTradeCondition(raw)
}

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

// Levenshtein edit distance — same as triage upload
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
brand, model, storage, condition, quantity, customer_net, gross_price, fair_price, carrier_deduction, eg_deduction, imei, serial, color, notes, year, ignore

Example: {"Phone Model": "model", "Device Count": "quantity", "30 Days Good": "gross_price", "30 Days Fair": "fair_price"}

Rules:
- If a column is a price with "good" context → gross_price
- If a column is a price with "fair" context → fair_price
- If a column is "net", "customer", or the final customer take-home → customer_net
- Bell/Rogers/spiff columns → carrier_deduction
- EG/Evergreen/processing fee → eg_deduction
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
  match_status: 'matched' | 'catalog_matched' | 'not_in_catalog'
  row_error?: string
}

export type TradeTemplateSummary = {
  total_devices: number
  matched: number
  unmatched: number
  total_value: number | null
  format_type: 'batch' | 'per_device' | 'unknown'
  detected_columns: Record<string, string>
  llm_assisted: boolean
}

// ── Main handler ─────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
    const role = profile?.role ?? 'customer'
    const allowedRoles = ['admin', 'coe_manager', 'coe_tech', 'sales', 'customer']
    if (!allowedRoles.includes(role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

    const ext = file.name.toLowerCase().split('.').pop() ?? ''
    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      return NextResponse.json({ error: 'Supported formats: CSV, Excel (.xlsx / .xls)' }, { status: 400 })
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 400 })
    }

    // ── Parse file ────────────────────────────────────────────────────────────
    let headers: string[] = []
    let dataRows: string[][] = []

    if (ext === 'xlsx' || ext === 'xls') {
      const XLSX = await import('xlsx')
      const arrayBuffer = await file.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      if (!sheet) return NextResponse.json({ error: 'Excel file has no worksheet' }, { status: 400 })
      const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][]
      if (!raw || raw.length < 2) return NextResponse.json({ error: 'File needs a header row and at least one data row' }, { status: 400 })
      headers = (raw[0] as unknown[]).map(h => String(h ?? '').trim()).filter(h => h)
      dataRows = raw.slice(1)
        .filter(row => (row as unknown[]).some(c => String(c ?? '').trim()))
        .map(row => (row as unknown[]).map(c => String(c ?? '').trim()))
    } else {
      const text = await file.text()
      const { default: Papa } = await import('papaparse')
      const result = Papa.parse(text, { skipEmptyLines: true })
      const allRows = result.data as string[][]
      if (allRows.length < 2) return NextResponse.json({ error: 'File needs a header row and at least one data row' }, { status: 400 })
      headers = allRows[0].map(h => String(h ?? '').trim())
      dataRows = allRows.slice(1)
    }

    // ── Column mapping ────────────────────────────────────────────────────────
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

    // LLM fallback when less than 30% of columns mapped OR no model/brand found
    let llmAssisted = false
    const hasEssentials = ('model' in colIndex || 'brand' in colIndex)
    if (!hasEssentials || mappedCount < Math.ceil(headers.length * 0.3)) {
      console.info('[parse-trade-template] llm_fallback_triggered', {
        file: file.name,
        file_size_kb: Math.round(file.size / 1024),
        headers,
        mapped_count: mappedCount,
        total_headers: headers.length,
        has_essentials: hasEssentials,
        trigger_reason: !hasEssentials ? 'no_model_or_brand' : 'low_column_coverage',
      })

      const llmMap = await inferColumnsWithLLM(headers, dataRows.slice(0, 3))
      if (llmMap) {
        llmAssisted = true
        let llmResolvedCount = 0
        for (const [rawHeader, canonical] of Object.entries(llmMap)) {
          if (!canonical || canonical === 'ignore') continue
          const idx = headers.findIndex(h => h.toLowerCase().trim() === rawHeader.toLowerCase().trim())
          if (idx >= 0 && !(canonical in colIndex)) {
            colIndex[canonical] = idx
            detectedColumns[rawHeader] = canonical
            llmResolvedCount++
          }
        }
        console.info('[parse-trade-template] llm_fallback_resolved', {
          file: file.name,
          llm_resolved_columns: llmResolvedCount,
          final_mapped: Object.keys(colIndex).length,
          llm_mapping: llmMap,
        })
      } else {
        console.warn('[parse-trade-template] llm_fallback_failed', {
          file: file.name,
          headers,
          groq_api_key_set: !!process.env.GROQ_API_KEY,
        })
      }
    }

    // ── Extract rows ──────────────────────────────────────────────────────────
    const get = (cells: string[], field: string): string => {
      const idx = colIndex[field]
      return idx != null ? (cells[idx] ?? '').trim() : ''
    }

    const parsedRows: ParsedRow[] = []
    for (let i = 0; i < Math.min(dataRows.length, 1000); i++) {
      const cells = dataRows[i]
      if (!cells || cells.every(c => !c)) continue

      let brand = get(cells, 'brand')
      let model = get(cells, 'model')

      // Handle "Apple iPhone 14 128GB Black" in a single column
      if (!model && brand) {
        const combinedParts = brand.split(/\s+/)
        if (combinedParts.length > 2) {
          const known = ['apple', 'samsung', 'google', 'motorola', 'lg', 'sony', 'oneplus', 'sonim', 'kyocera', 'blackberry', 'netgear', 'novatel', 'inseego']
          const lowerBrand = combinedParts[0].toLowerCase()
          if (known.includes(lowerBrand)) {
            brand = combinedParts[0]
            model = combinedParts.slice(1).join(' ')
          }
        }
      }

      const condRaw = get(cells, 'condition')
      const qtyRaw = get(cells, 'quantity')
      const qty = qtyRaw ? (parseInt(qtyRaw, 10) || 1) : 1

      parsedRows.push({
        brand: brand || '',
        model: model || '',
        storage: normalizeStorage(get(cells, 'storage')) || '',
        condition: normalizeCondition(condRaw),
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

    // Filter out rows with no device info
    const validRows = parsedRows.filter(r => r.brand || r.model)
    if (validRows.length === 0) {
      return NextResponse.json({ error: 'No device rows found. Check that your file has Make/Model/Brand columns.' }, { status: 400 })
    }

    // ── Detect format type ────────────────────────────────────────────────────
    const hasSerials = validRows.some(r => r.serial || r.imei)
    const hasQty = 'quantity' in colIndex
    const formatType: 'batch' | 'per_device' | 'unknown' = hasSerials ? 'per_device' : hasQty ? 'batch' : 'unknown'

    // ── Fetch device catalog ──────────────────────────────────────────────────
    const { data: devices } = await supabase
      .from('devices')
      .select('id, make, model, storage_options, category')
      .order('make')

    const catalog = (devices ?? []) as unknown as Device[]

    // ── Aggregate + match ─────────────────────────────────────────────────────
    // For per-device format: group by make+model+storage+condition, collect serials/IMEIs
    // For batch format: each row is already aggregated

    type AggKey = string
    type AggEntry = {
      make: string; model: string; storage: string; condition: string
      quantity: number; unit_price: number | null
      serials: string[]; imeis: string[]
    }

    const agg = new Map<AggKey, AggEntry>()

    for (const row of validRows) {
      if (row.condition === 'recycle') continue // Skip recycle rows

      // Determine the best price: customer_net > gross_price (fair if condition is fair)
      const isFair = row.condition === 'fair' || row.condition === 'poor'
      let unitPrice: number | null = row.customer_net
      if (!unitPrice) unitPrice = isFair ? (row.fair_price ?? row.gross_price) : row.gross_price

      const key: AggKey = `${row.brand}|${row.model}|${row.storage}|${row.condition}`

      if (formatType === 'per_device') {
        // Aggregate per-device rows
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
        // Batch: use explicit quantity
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
      const device = matchDeviceFromCsv(catalog, entry.make, entry.model)
      outputRows.push({
        make: entry.make,
        model: entry.model,
        storage: entry.storage,
        condition: entry.condition,
        quantity: entry.quantity,
        unit_price: entry.unit_price,
        serials: entry.serials,
        imeis: entry.imeis,
        device_id: device?.id ?? null,
        match_status: (device ? 'matched' : 'not_in_catalog') as 'matched' | 'catalog_matched' | 'not_in_catalog',
      })
    }

    const matched = outputRows.filter(r => r.match_status === 'matched').length
    const totalDevices = outputRows.reduce((s, r) => s + r.quantity, 0)
    const totalValue = outputRows.some(r => r.unit_price != null)
      ? outputRows.reduce((s, r) => s + (r.unit_price ?? 0) * r.quantity, 0)
      : null

    const summary: TradeTemplateSummary = {
      total_devices: totalDevices,
      matched,
      unmatched: outputRows.length - matched,
      total_value: totalValue ? Math.round(totalValue * 100) / 100 : null,
      format_type: formatType,
      detected_columns: detectedColumns,
      llm_assisted: llmAssisted,
    }

    return NextResponse.json({ rows: outputRows, summary })
  } catch (err) {
    console.error('[parse-trade-template]', err)
    return NextResponse.json({ error: 'Failed to parse file' }, { status: 500 })
  }
}
