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
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { matchDeviceFromCsv } from '@/lib/device-match'
import { normalizeTradeCondition } from '@/lib/condition'
import type { Device } from '@/types'

export const dynamic = 'force-dynamic'

// ── Known device brands (for combined-field splitting and brand inference) ───
const KNOWN_BRANDS = ['apple', 'samsung', 'google', 'motorola', 'lg', 'sony',
  'oneplus', 'sonim', 'kyocera', 'blackberry', 'netgear', 'novatel',
  'inseego', 'microsoft', 'lenovo', 'dell', 'hp', 'asus']

// ── Column aliases covering all trade quote formats seen in the wild ─────────
const TRADE_COLUMN_MAP: Record<string, string> = {
  // Device identification
  'make': 'brand', 'brand': 'brand', 'manufacturer': 'brand', 'oem': 'brand',
  'mfr': 'brand', 'vendor': 'brand',
  'model': 'model', 'device': 'model', 'device model': 'model', 'device_model': 'model',
  'model name': 'model', 'phone model': 'model', 'product': 'model',
  'description': 'model', 'existing phone': 'model', 'models': 'model',

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
  '#': 'quantity', 'device count': 'quantity', 'volume': 'quantity',

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
  'serial': 'serial', 'serial number': 'serial', 'serial_number': 'serial',
  'sample s/n': 'serial', 's/n': 'serial', 'sn': 'serial',

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
  // Fallback: first word that isn't a number
  const firstWord = modelStr.trim().split(/\s+/)[0]
  return /^\d+$/.test(firstWord) ? '' : firstWord
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
  sheet_parsed: string
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

    // ── Sheet selection ───────────────────────────────────────────────────────
    const sheetParam = request.nextUrl.searchParams.get('sheet') ?? ''

    let headers: string[] = []
    let dataRows: string[][] = []
    let sheetParsed = 'Sheet1'
    let availableSheets: string[] = []

    if (ext === 'xlsx' || ext === 'xls') {
      const XLSX = await import('xlsx')
      const arrayBuffer = await file.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: 'array' })
      availableSheets = workbook.SheetNames
      sheetParsed = sheetParam || workbook.SheetNames[0]

      // Resolve sheet by name or numeric index
      let resolvedSheet = sheetParsed
      if (!workbook.Sheets[resolvedSheet]) {
        const idx = parseInt(sheetParam, 10)
        resolvedSheet = Number.isFinite(idx) ? (workbook.SheetNames[idx] ?? workbook.SheetNames[0]) : workbook.SheetNames[0]
        sheetParsed = resolvedSheet
      }

      const sheet = workbook.Sheets[resolvedSheet]
      if (!sheet) return NextResponse.json({ error: 'Sheet not found' }, { status: 400 })
      const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][]
      if (!raw || raw.length < 2) return NextResponse.json({ error: 'Sheet needs a header row and at least one data row', available_sheets: availableSheets }, { status: 400 })

      // Auto-detect the header row (not always row 0)
      const { headerIdx, groupIdx } = findHeaderRow(raw)
      headers = buildHeaders(raw, headerIdx, groupIdx).filter((_, i) => i < (raw[headerIdx] as unknown[]).length)
      dataRows = raw
        .slice(headerIdx + 1)
        .filter(row => (row as unknown[]).some(c => String(c ?? '').trim()))
        .map(row => (row as unknown[]).map(c => String(c ?? '').trim()))
    } else {
      const text = await file.text()
      const { default: Papa } = await import('papaparse')
      const result = Papa.parse(text, { skipEmptyLines: true })
      const allRows = result.data as string[][]
      if (allRows.length < 2) return NextResponse.json({ error: 'File needs a header row and at least one data row' }, { status: 400 })
      availableSheets = ['Sheet1']
      sheetParsed = 'Sheet1'

      // Auto-detect header row in CSV too
      const { headerIdx, groupIdx } = findHeaderRow(allRows)
      headers = buildHeaders(allRows, headerIdx, groupIdx)
      dataRows = allRows.slice(headerIdx + 1).filter(row => row.some(c => c.trim()))
    }

    // ── Pivot detection ───────────────────────────────────────────────────────
    if (detectPivot(headers, dataRows)) {
      const pivotRows = parsePivot(headers, dataRows)
      if (pivotRows.length > 0) {
        // Go straight to aggregation with the transposed rows
        const { data: devices } = await supabase.from('devices').select('id, make, model, storage_options, category').order('make')
        const catalog = (devices ?? []) as unknown as Device[]
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
        const matched = outputRows.filter(r => r.match_status === 'matched').length
        const totalDevices = outputRows.reduce((s, r) => s + r.quantity, 0)
        return NextResponse.json({
          rows: outputRows,
          summary: {
            total_devices: totalDevices,
            matched,
            unmatched: outputRows.length - matched,
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

    // LLM fallback when less than 30% of columns mapped OR no model/brand found
    let llmAssisted = false
    const hasEssentials = ('model' in colIndex || 'brand' in colIndex)
    if (!hasEssentials || mappedCount < Math.ceil(headers.length * 0.3)) {
      const llmMap = await inferColumnsWithLLM(headers, dataRows.slice(0, 3))
      if (llmMap) {
        llmAssisted = true
        for (const [rawHeader, canonical] of Object.entries(llmMap)) {
          if (!canonical || canonical === 'ignore') continue
          const idx = headers.findIndex(h => h.toLowerCase().trim() === rawHeader.toLowerCase().trim())
          if (idx >= 0 && !(canonical in colIndex)) {
            colIndex[canonical] = idx
            detectedColumns[rawHeader] = canonical
          }
        }
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
      let storage = get(cells, 'storage')

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
      const qty = qtyRaw ? (parseInt(qtyRaw, 10) || 1) : 1

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

    // Filter out rows with no device info
    const validRows = parsedRows.filter(r => r.brand || r.model)
    if (validRows.length === 0) {
      return NextResponse.json({
        error: 'No device rows found. Check that your file has Make/Model/Brand columns.',
        available_sheets: availableSheets,
      }, { status: 400 })
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
    type AggKey = string
    type AggEntry = {
      make: string; model: string; storage: string; condition: string
      quantity: number; unit_price: number | null
      serials: string[]; imeis: string[]
    }

    const agg = new Map<AggKey, AggEntry>()

    for (const row of validRows) {
      if (row.condition === 'recycle') continue // Skip recycle rows

      const isFair = row.condition === 'fair' || row.condition === 'poor'
      let unitPrice: number | null = row.customer_net
      if (!unitPrice) unitPrice = isFair ? (row.fair_price ?? row.gross_price) : row.gross_price

      const key: AggKey = `${row.brand}|${row.model}|${row.storage}|${row.condition}`

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
      sheet_parsed: sheetParsed,
    }

    return NextResponse.json({ rows: outputRows, summary, available_sheets: availableSheets })
  } catch (err) {
    console.error('[parse-trade-template]', err)
    return NextResponse.json({ error: 'Failed to parse file' }, { status: 500 })
  }
}
