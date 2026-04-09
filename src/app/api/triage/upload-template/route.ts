// ============================================================================
// TRIAGE TEMPLATE UPLOAD API
// POST /api/triage/upload-template
// Accepts CSV, Excel (.xlsx/.xls), or plain text files.
// Auto-detects columns, extracts quote/order number, matches devices against
// the referenced order with fuzzy spelling correction, and returns a preview.
// Does NOT write to the DB — the client submits matched devices separately.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { sanitizeCsvCell } from '@/lib/utils'

export const dynamic = 'force-dynamic'

// ── Column aliases ─────────────────────────────────────────────────────────
const COLUMN_MAP: Record<string, string> = {
  'no': 'row_num', 'no.': 'row_num', '#': 'row_num',
  'order': 'order_ref', 'order_number': 'order_ref', 'order number': 'order_ref',
  'order#': 'order_ref', 'order #': 'order_ref', 'quote': 'order_ref',
  'quote_number': 'order_ref', 'quote number': 'order_ref', 'quote#': 'order_ref',
  'reference': 'order_ref', 'ref': 'order_ref', 'ref#': 'order_ref',
  'imei': 'imei', 'imei/serial': 'imei', 'imei / serial': 'imei',
  'imei/meid': 'imei', 'imei / meid': 'imei', 'imei meid': 'imei',
  'serial': 'serial', 'serial_number': 'serial', 'serial number': 'serial', 's/n': 'serial',
  'make': 'brand', 'brand': 'brand', 'manufacturer': 'brand', 'oem': 'brand',
  'model': 'model', 'device': 'model', 'device_model': 'model', 'device model': 'model',
  'model name': 'model', 'modelname': 'model', 'product': 'product', 'device name': 'model',
  'storage': 'storage', 'storage/gb': 'storage', 'capacity': 'storage', 'gb': 'storage',
  'color': 'color', 'colour': 'color',
  'battery info': 'battery_health', 'battery health': 'battery_health',
  'battery %': 'battery_health', 'battery%': 'battery_health', 'battery': 'battery_health',
  'battery_info': 'battery_health', 'battery_health': 'battery_health',
  'sim lock': 'sim_lock', 'simlock': 'sim_lock', 'sim': 'sim_lock', 'sim_lock': 'sim_lock',
  'locked carrier': 'locked_carrier', 'locked_carrier': 'locked_carrier', 'carrier lock': 'locked_carrier',
  'condition': 'condition', 'grade': 'condition', 'condtion': 'condition', 'condiiton': 'condition',
  'device cost': 'device_cost', 'devicecost': 'device_cost', 'device_cost': 'device_cost',
  'cost': 'device_cost',
  'repair cost': 'repair_cost', 'repaircost': 'repair_cost', 'repair_cost': 'repair_cost',
  'quantity': 'quantity', 'qty': 'quantity', 'count': 'quantity',
  'notes': 'notes', 'faults': 'notes', 'faults/notes': 'notes', 'comments': 'notes',
}

const CONDITION_MAP: Record<string, string> = {
  new: 'new', sealed: 'new', unopened: 'new',
  excellent: 'excellent', 'like new': 'excellent', likenew: 'excellent',
  a: 'excellent', 'a+': 'excellent', 'a-': 'excellent', 'grade a': 'excellent',
  good: 'good', b: 'good', 'b-': 'good', 'b+': 'good', 'grade b': 'good',
  fair: 'fair', average: 'fair', c: 'fair', 'c+': 'fair', 'c-': 'fair', 'grade c': 'fair',
  poor: 'poor', broken: 'poor', damaged: 'poor', cracked: 'poor',
  d: 'poor', 'grade d': 'poor',
}

function normalizeCondition(raw: string): string | null {
  const s = raw.toLowerCase().trim()
  return CONDITION_MAP[s] ?? null
}

function autoCorrectColumn(header: string): string | undefined {
  const lower = header.toLowerCase().trim().replace(/\s+/g, ' ')
  // Exact match first
  if (COLUMN_MAP[lower]) return COLUMN_MAP[lower]
  // Fuzzy: find closest key with edit distance ≤ 2
  let best: string | undefined
  let bestDist = 3
  for (const key of Object.keys(COLUMN_MAP)) {
    const dist = levenshtein(lower, key)
    if (dist < bestDist) { bestDist = dist; best = COLUMN_MAP[key] }
  }
  return best
}

// Levenshtein edit distance (max comparison length 20 to keep it fast)
function levenshtein(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return 99
  if (a.length > 20 || b.length > 20) return 99
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => Array(n + 1).fill(0).map((__, j) => i === 0 ? j : j === 0 ? i : 0))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
  return dp[m][n]
}

// Fuzzy match: does str contain target with at most 1 char difference per 4 chars?
function fuzzyContains(haystack: string, needle: string): boolean {
  if (!needle) return true
  if (haystack.includes(needle)) return true
  // Allow up to floor(needle.length/4) errors
  const maxErrors = Math.floor(needle.length / 4)
  if (maxErrors === 0) return haystack.includes(needle)
  // Sliding window edit distance
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    if (levenshtein(haystack.slice(i, i + needle.length), needle) <= maxErrors) return true
  }
  return false
}

// CSV parser (handles quoted cells and commas inside quotes)
function parseCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else { inQuotes = !inQuotes }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current); current = ''
    } else { current += ch }
  }
  cells.push(current)
  return cells.map(c => sanitizeCsvCell(c.trim()))
}

// Convert a 2D array of cells (rows×cols) to ParsedRow[]
type ParsedRow = {
  row: number
  order_ref?: string
  imei?: string
  serial?: string
  brand?: string
  model?: string
  condition?: string
  storage?: string
  color?: string
  battery_health?: number
  sim_lock?: string
  locked_carrier?: string
  device_cost?: number
  repair_cost?: number
  quantity?: number
  notes?: string
  raw: Record<string, string>
}

function sheetToRows(headers: string[], dataRows: string[][]): ParsedRow[] {
  const colIndex: Record<string, number> = {}
  for (let i = 0; i < headers.length; i++) {
    const canonical = autoCorrectColumn(headers[i].toLowerCase().trim())
    if (canonical && !(canonical in colIndex)) colIndex[canonical] = i
  }

  const rows: ParsedRow[] = []
  for (let i = 0; i < Math.min(dataRows.length, 500); i++) {
    const cells = dataRows[i]
    if (!cells || cells.every(c => !c)) continue

    const get = (field: string) => {
      const idx = colIndex[field]
      return idx != null ? (cells[idx] ?? '').toString().trim() : ''
    }

    let brand = get('brand')
    let model = get('model')
    const product = get('product')
    if (product && !brand && !model) {
      const parts = product.split(/\s+/)
      brand = parts[0] ?? ''
      model = parts.slice(1).join(' ')
    }

    const condRaw = get('condition')
    const condNorm = normalizeCondition(condRaw) ?? condRaw.toLowerCase()
    const qtyRaw = get('quantity')
    const battRaw = get('battery_health').replace('%', '').trim()
    const battNum = battRaw ? parseFloat(battRaw) : undefined
    const battHealth = battNum != null && !Number.isNaN(battNum) ? battNum : undefined
    const deviceCostRaw = get('device_cost').replace(/[$,]/g, '').trim()
    const repairCostRaw = get('repair_cost').replace(/[$,]/g, '').trim()

    rows.push({
      row: i + 2,
      order_ref: get('order_ref') || undefined,
      imei: get('imei') || undefined,
      serial: get('serial') || undefined,
      brand: brand || undefined,
      model: model || undefined,
      condition: condNorm || undefined,
      storage: get('storage') || undefined,
      color: get('color') || undefined,
      battery_health: battHealth,
      sim_lock: get('sim_lock') || undefined,
      locked_carrier: get('locked_carrier') || undefined,
      device_cost: deviceCostRaw ? (parseFloat(deviceCostRaw) || undefined) : undefined,
      repair_cost: repairCostRaw ? (parseFloat(repairCostRaw) || undefined) : undefined,
      quantity: qtyRaw ? (parseInt(qtyRaw, 10) || 1) : undefined,
      notes: get('notes') || undefined,
      raw: Object.fromEntries(headers.map((h, idx) => [h, (cells[idx] ?? '').toString()])),
    })
  }
  return rows
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (!profile || !['admin', 'coe_manager', 'coe_tech'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

    const ext = file.name.toLowerCase().split('.').pop() ?? ''
    if (!['csv', 'txt', 'xlsx', 'xls'].includes(ext)) {
      return NextResponse.json({ error: 'Supported formats: CSV, Excel (.xlsx/.xls), plain text (.txt)' }, { status: 400 })
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 400 })
    }

    // ── Parse file into headers + data rows ───────────────────────────────
    let headers: string[] = []
    let dataRows: string[][] = []

    if (ext === 'xlsx' || ext === 'xls') {
      // Excel parsing via SheetJS
      const XLSX = await import('xlsx')
      const arrayBuffer = await file.arrayBuffer()
      const workbook = XLSX.read(arrayBuffer, { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][]
      if (!raw || raw.length < 2) {
        return NextResponse.json({ error: 'Excel file must have a header row and at least one data row' }, { status: 400 })
      }
      headers = (raw[0] as unknown[]).map(h => String(h ?? ''))
      dataRows = raw.slice(1).map(row => (row as unknown[]).map(c => String(c ?? '')))
    } else {
      // CSV / TXT
      const text = await file.text()
      const rawLines = text.split(/\r?\n/).filter(l => l.trim())
      if (rawLines.length < 2) {
        return NextResponse.json({ error: 'File must have a header row and at least one data row' }, { status: 400 })
      }
      headers = parseCsvLine(rawLines[0])
      dataRows = rawLines.slice(1).map(l => parseCsvLine(l))
    }

    const rows = sheetToRows(headers, dataRows)
    if (rows.length === 0) {
      return NextResponse.json({ error: 'No data rows found in file' }, { status: 400 })
    }

    // ── Auto-detect order/quote number ─────────────────────────────────────
    let detectedRef: string | null = null
    const refFromCol = rows.find(r => r.order_ref)?.order_ref ?? null
    if (refFromCol) {
      detectedRef = refFromCol
    } else {
      for (const row of rows) {
        for (const val of Object.values(row.raw)) {
          if (/^(ORD|QUO|TRD|CPO)-\d+$/i.test(val.trim())) {
            detectedRef = val.trim().toUpperCase()
            break
          }
        }
        if (detectedRef) break
      }
    }

    // ── Look up the order ──────────────────────────────────────────────────
    type OrderItem = {
      id: string
      device_id: string | null
      quantity: number
      claimed_condition: string | null
      quoted_price: number | null
      storage: string | null
      actual_condition: string | null
      device: { make: string; model: string } | null
    }

    let order: {
      id: string
      order_number: string
      status: string
      total_quantity: number
      quoted_amount: number | null
      items: OrderItem[]
    } | null = null

    if (detectedRef) {
      const { data: orders } = await supabase
        .from('orders')
        .select(`
          id, order_number, status, total_quantity, quoted_amount,
          order_items(
            id, device_id, quantity, claimed_condition, quoted_price, storage, actual_condition,
            device:device_catalog(make, model)
          )
        `)
        .ilike('order_number', detectedRef)
        .limit(1)

      if (orders?.[0]) {
        const raw = orders[0] as Record<string, unknown>
        order = {
          id: raw.id as string,
          order_number: raw.order_number as string,
          status: raw.status as string,
          total_quantity: raw.total_quantity as number,
          quoted_amount: raw.quoted_amount as number | null,
          items: ((raw.order_items as OrderItem[]) || []).map(i => ({
            ...i,
            device: Array.isArray(i.device) ? (i.device[0] ?? null) : (i.device ?? null),
          })),
        }
      }
    }

    // ── Resolve device_catalog IDs (case-insensitive + fuzzy) ─────────────
    const deviceLookupMap = new Map<string, string>() // "make|model" → device_id
    const { data: catalogDevices } = await supabase.from('device_catalog').select('id, make, model')
    if (catalogDevices) {
      // Exact key map first
      for (const d of catalogDevices) {
        const key = `${d.make.toLowerCase()}|${d.model.toLowerCase()}`
        if (!deviceLookupMap.has(key)) deviceLookupMap.set(key, d.id)
      }
      // Fuzzy match per row
      for (const row of rows) {
        const makeLower = (row.brand ?? '').toLowerCase()
        const modelLower = (row.model ?? '').toLowerCase()
        if (!makeLower && !modelLower) continue
        const exactKey = `${makeLower}|${modelLower}`
        if (deviceLookupMap.has(exactKey)) continue
        // Fuzzy: try partial substring + typo tolerance
        const fuzzy = catalogDevices.find(d => {
          const dm = d.make.toLowerCase()
          const dmod = d.model.toLowerCase()
          const makeMatch = !makeLower || fuzzyContains(dm, makeLower) || fuzzyContains(makeLower, dm)
          const modelMatch = !modelLower || fuzzyContains(dmod, modelLower) || fuzzyContains(modelLower, dmod)
          return makeMatch && modelMatch
        })
        if (fuzzy) deviceLookupMap.set(exactKey, fuzzy.id)
      }
    }

    // ── Match rows against order items ─────────────────────────────────────
    type RowResult = ParsedRow & {
      match_status: 'matched' | 'condition_mismatch' | 'not_in_order'
      matched_item?: OrderItem
      quoted_price?: number | null
      device_id?: string | null
    }

    const results: RowResult[] = rows.map(row => {
      const makeLower = (row.brand ?? '').toLowerCase()
      const modelLower = (row.model ?? '').toLowerCase()
      const deviceKey = `${makeLower}|${modelLower}`
      const device_id = deviceLookupMap.get(deviceKey) ?? null

      // No order found — resolve device from catalog so user can still import
      if (!order) {
        return {
          ...row,
          device_id,
          match_status: device_id ? 'matched' as const : 'not_in_order' as const,
        }
      }

      // Match order item by fuzzy make+model
      let matched = order.items.find(i => {
        const d = i.device
        if (!d) return false
        const dm = d.make.toLowerCase()
        const dmod = d.model.toLowerCase()
        const makeMatch = !makeLower || fuzzyContains(dm, makeLower) || fuzzyContains(makeLower, dm)
        const modelMatch = !modelLower || fuzzyContains(dmod, modelLower) || fuzzyContains(modelLower, dmod)
        return makeMatch && modelMatch
      }) ?? null

      // If only one order item, assign to it regardless of make/model
      if (!matched && order.items.length === 1) matched = order.items[0]

      if (!matched) {
        return { ...row, device_id, match_status: 'not_in_order' as const }
      }

      // Resolve device_id from matched order item if not in catalog lookup
      const resolvedDeviceId = device_id ?? matched.device_id

      const conditionMismatch = row.condition && matched.claimed_condition &&
        row.condition !== matched.claimed_condition

      return {
        ...row,
        device_id: resolvedDeviceId,
        match_status: conditionMismatch ? 'condition_mismatch' as const : 'matched' as const,
        matched_item: matched,
        quoted_price: matched.quoted_price,
      }
    })

    return NextResponse.json({
      detected_ref: detectedRef,
      order: order ? {
        id: order.id,
        order_number: order.order_number,
        status: order.status,
        total_quantity: order.total_quantity,
        quoted_amount: order.quoted_amount,
      } : null,
      rows: results,
      total: results.length,
      matched: results.filter(r => r.match_status === 'matched').length,
      condition_mismatches: results.filter(r => r.match_status === 'condition_mismatch').length,
      not_in_order: results.filter(r => r.match_status === 'not_in_order').length,
      columns_detected: Object.keys(
        (() => {
          const idx: Record<string, number> = {}
          headers.forEach((h, i) => {
            const c = autoCorrectColumn(h.toLowerCase().trim())
            if (c && !(c in idx)) idx[c] = i
          })
          return idx
        })()
      ),
    })
  } catch (error) {
    console.error('Triage template upload error:', error)
    return NextResponse.json({ error: 'Failed to process file' }, { status: 500 })
  }
}
