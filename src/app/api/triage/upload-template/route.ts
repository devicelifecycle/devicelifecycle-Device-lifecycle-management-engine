// ============================================================================
// TRIAGE TEMPLATE UPLOAD API
// POST /api/triage/upload-template
// Accepts a CSV file (multipart/form-data, field name "file").
// Auto-detects columns, extracts quote/order number, matches devices against
// the referenced order, and returns a preview with match/mismatch status.
// Does NOT write to the DB — the client submits matched devices separately.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { sanitizeCsvCell } from '@/lib/utils'

export const dynamic = 'force-dynamic'

// ── Column aliases ─────────────────────────────────────────────────────────
const COLUMN_MAP: Record<string, string> = {
  // Row number (ignored, we use file line index)
  'no': 'row_num', 'no.': 'row_num', '#': 'row_num',
  // Order / Quote reference
  'order': 'order_ref', 'order_number': 'order_ref', 'order number': 'order_ref',
  'order#': 'order_ref', 'order #': 'order_ref', 'quote': 'order_ref',
  'quote_number': 'order_ref', 'quote number': 'order_ref', 'quote#': 'order_ref',
  'reference': 'order_ref', 'ref': 'order_ref', 'ref#': 'order_ref',
  // IMEI / Serial
  'imei': 'imei', 'imei/serial': 'imei', 'imei / serial': 'imei',
  'imei/meid': 'imei', 'imei / meid': 'imei', 'imei meid': 'imei',
  'serial': 'serial', 'serial_number': 'serial', 'serial number': 'serial', 's/n': 'serial',
  // Make / Model
  'make': 'brand', 'brand': 'brand', 'manufacturer': 'brand', 'oem': 'brand',
  'model': 'model', 'device': 'model', 'device_model': 'model', 'device model': 'model',
  'model name': 'model', 'modelname': 'model', 'product': 'product', 'device name': 'model',
  // Storage / Capacity
  'storage': 'storage', 'storage/gb': 'storage', 'capacity': 'storage', 'gb': 'storage',
  // Color
  'color': 'color', 'colour': 'color',
  // Battery
  'battery info': 'battery_health', 'battery health': 'battery_health',
  'battery %': 'battery_health', 'battery%': 'battery_health', 'battery': 'battery_health',
  'battery_info': 'battery_health', 'battery_health': 'battery_health',
  // SIM lock / Carrier
  'sim lock': 'sim_lock', 'simlock': 'sim_lock', 'sim': 'sim_lock', 'sim_lock': 'sim_lock',
  'locked carrier': 'locked_carrier', 'locked_carrier': 'locked_carrier', 'carrier lock': 'locked_carrier',
  // Condition / Grade
  'condition': 'condition', 'grade': 'condition', 'condtion': 'condition', 'condiiton': 'condition',
  // Costs
  'device cost': 'device_cost', 'devicecost': 'device_cost', 'device_cost': 'device_cost',
  'cost': 'device_cost',
  'repair cost': 'repair_cost', 'repaircost': 'repair_cost', 'repair_cost': 'repair_cost',
  // Quantity
  'quantity': 'quantity', 'qty': 'quantity', 'count': 'quantity',
  // Notes / Faults / Comments
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
  return COLUMN_MAP[lower]
}

// Basic CSV parser (handles quoted cells and commas inside quotes)
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
      cells.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current)
  return cells.map(c => sanitizeCsvCell(c.trim()))
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'coe_manager', 'coe_tech'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })

    const ext = file.name.toLowerCase().split('.').pop()
    if (!['csv', 'txt'].includes(ext ?? '')) {
      return NextResponse.json({ error: 'Only CSV files are supported (.csv or .txt)' }, { status: 400 })
    }
    if (file.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large (max 2 MB)' }, { status: 400 })
    }

    const text = await file.text()
    const rawLines = text.split(/\r?\n/).filter(l => l.trim())
    if (rawLines.length < 2) {
      return NextResponse.json({ error: 'File must have a header row and at least one data row' }, { status: 400 })
    }

    // ── Parse header ───────────────────────────────────────────────────────
    const headers = parseCsvLine(rawLines[0]).map(h => h.toLowerCase().trim())
    const colIndex: Record<string, number> = {}
    for (let i = 0; i < headers.length; i++) {
      const canonical = autoCorrectColumn(headers[i])
      if (canonical && !(canonical in colIndex)) colIndex[canonical] = i
    }

    // ── Parse rows ─────────────────────────────────────────────────────────
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

    const rows: ParsedRow[] = []
    for (let i = 1; i < Math.min(rawLines.length, 501); i++) {
      const cells = parseCsvLine(rawLines[i])
      if (cells.every(c => !c)) continue

      const get = (field: string) => {
        const idx = colIndex[field]
        return idx != null ? (cells[idx] ?? '').trim() : ''
      }

      // Product column: attempt to split brand from combined "Apple iPhone 15"
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

      // Battery health: strip % sign and parse
      const battRaw = get('battery_health').replace('%', '').trim()
      const battNum = battRaw ? parseFloat(battRaw) : undefined
      const battHealth = battNum != null && !Number.isNaN(battNum) ? battNum : undefined

      // Costs
      const deviceCostRaw = get('device_cost').replace(/[$,]/g, '').trim()
      const repairCostRaw = get('repair_cost').replace(/[$,]/g, '').trim()
      const deviceCost = deviceCostRaw ? (parseFloat(deviceCostRaw) || undefined) : undefined
      const repairCost = repairCostRaw ? (parseFloat(repairCostRaw) || undefined) : undefined

      rows.push({
        row: i + 1,
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
        device_cost: deviceCost,
        repair_cost: repairCost,
        quantity: qtyRaw ? (parseInt(qtyRaw, 10) || 1) : undefined,
        notes: get('notes') || undefined,
        raw: Object.fromEntries(headers.map((h, idx) => [h, cells[idx] ?? ''])),
      })
    }

    // ── Auto-detect order/quote number ─────────────────────────────────────
    // Try column first, then scan all cell values for patterns like ORD-0001
    let detectedRef: string | null = null
    const refFromCol = rows.find(r => r.order_ref)?.order_ref ?? null
    if (refFromCol) {
      detectedRef = refFromCol
    } else {
      // Scan all cells for order number pattern
      for (const row of rows) {
        for (const val of Object.values(row.raw)) {
          if (/^(ORD|QUO|TRD|CPO)-\d+$/i.test(val.trim())) {
            detectedRef = val.trim()
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

    // ── Resolve device_catalog IDs by make/model ──────────────────────────
    const deviceLookupMap = new Map<string, string>() // "make|model" → device_id
    const makes = [...new Set(rows.map(r => r.brand).filter(Boolean) as string[])]
    if (makes.length > 0) {
      const { data: catalogDevices } = await supabase
        .from('device_catalog')
        .select('id, make, model')
        .in('make', makes)
      if (catalogDevices) {
        for (const d of catalogDevices) {
          const key = `${d.make.toLowerCase()}|${d.model.toLowerCase()}`
          if (!deviceLookupMap.has(key)) deviceLookupMap.set(key, d.id)
        }
      }
    }

    // ── Match rows against order items ─────────────────────────────────────
    type RowResult = ParsedRow & {
      match_status: 'matched' | 'condition_mismatch' | 'not_in_order' | 'no_order'
      matched_item?: OrderItem
      quoted_price?: number | null
      device_id?: string | null
    }

    const results: RowResult[] = rows.map(row => {
      const deviceKey = `${(row.brand ?? '').toLowerCase()}|${(row.model ?? '').toLowerCase()}`
      const device_id = deviceLookupMap.get(deviceKey) ?? null
      if (!order) return { ...row, device_id, match_status: 'no_order' as const }

      // Try to match by make+model (IMEIs are per-unit, order items are aggregates)
      let matched = order.items.find(i => {
        const d = i.device
        if (!d) return false
        const makeLower = (row.brand ?? '').toLowerCase()
        const modelLower = (row.model ?? '').toLowerCase()
        return (
          d.make.toLowerCase().includes(makeLower) ||
          makeLower.includes(d.make.toLowerCase())
        ) && (
          d.model.toLowerCase().includes(modelLower) ||
          modelLower.includes(d.model.toLowerCase())
        )
      }) ?? null

      if (!matched && order.items.length === 1) matched = order.items[0]

      if (!matched) {
        return { ...row, device_id, match_status: 'not_in_order' as const }
      }

      const conditionMismatch = row.condition && matched.claimed_condition &&
        row.condition !== matched.claimed_condition

      return {
        ...row,
        device_id: device_id ?? matched.device_id,
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
      columns_detected: Object.keys(colIndex),
    })
  } catch (error) {
    console.error('Triage template upload error:', error)
    return NextResponse.json({ error: 'Failed to process file' }, { status: 500 })
  }
}
