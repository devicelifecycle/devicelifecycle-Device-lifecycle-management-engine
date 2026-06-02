// ============================================================================
// CSV TEMPLATES - Single source of truth for order CSV uploads
// Update sample data when adding devices to device_catalog.
// Upload accepts alternate columns: Make/Model, Brand, Storage/GB, etc.
// ============================================================================

export interface ParsedTabularUpload {
  headers: string[]
  rows: Record<string, string>[]
}

/** Trade-In template: device_make, device_model, quantity, condition, storage, serial_number, color, notes */
export const TRADE_IN_CSV_HEADERS = [
  'device_make',
  'device_model',
  'quantity',
  'condition',
  'storage',
  'serial_number',
  'color',
  'notes',
] as const

/** Trade-In sample rows - Apple only for reliable demo (always in first 100 devices) */
export const TRADE_IN_CSV_SAMPLE: string[][] = [
  ['Apple', 'iPhone 15', '5', 'excellent', '128GB', '359876543210001', 'Blue', 'Demo trade-in'],
  ['Apple', 'iPhone 15', '3', 'good', '256GB', '', 'Black', ''],
  ['Apple', 'iPhone 15 Pro', '2', 'fair', '256GB', '', 'Natural Titanium', 'Bulk buyback'],
  ['Apple', 'iPhone 15 Pro Max', '4', 'excellent', '256GB', '350123456789012', 'Natural Titanium', ''],
  ['Apple', 'iPhone 16', '2', 'good', '128GB', '', 'Black', 'Demo video-ready'],
]

/** CPO template: device_make, device_model, quantity, storage, notes */
export const CPO_CSV_HEADERS = [
  'device_make',
  'device_model',
  'quantity',
  'storage',
  'notes',
] as const

/** CPO sample rows - Apple only for reliable demo (always in first 100 devices) */
export const CPO_CSV_SAMPLE: string[][] = [
  ['Apple', 'iPhone 15', '150', '128GB', 'CPO bulk - corporate devices'],
  ['Apple', 'iPhone 15 Pro', '100', '256GB', ''],
  ['Apple', 'iPhone 15 Pro Max', '50', '512GB', 'CPO bulk purchase - demo ready'],
]

/** Alternate column names accepted during CSV parse (Make→device_make, etc.) */
export const CSV_COLUMN_ALIASES: Record<string, string> = {
  // Make / brand (many customer spreadsheets use different names)
  make: 'device_make',
  brand: 'device_make',
  manufacturer: 'device_make',
  oem: 'device_make',
  mfr: 'device_make',
  company: 'device_make',
  phone_brand: 'device_make',
  phone_make: 'device_make',
  device_make: 'device_make',   // explicit self-map — no reliance on fallback

  // Model (many customer spreadsheets use different names)
  model: 'device_model',
  device: 'device_model',
  product: 'device_model',
  phone_model: 'device_model',
  device_name: 'device_model',
  model_name: 'device_model',
  device_model: 'device_model', // explicit self-map
  'existing phone': 'device_model',

  // Storage
  storage: 'storage',
  'storage/gb': 'storage',
  capacity: 'storage',
  gb: 'storage',
  size: 'storage',
  memory: 'storage',

  // Condition
  condition: 'condition',
  condtion: 'condition',
  condiiton: 'condition',
  grade: 'condition',
  state: 'condition',
  'device condition': 'condition',

  // Quantity
  quantity: 'quantity',
  qty: 'quantity',
  count: 'quantity',
  num: 'quantity',
  '#': 'quantity',
  device_count: 'quantity',
  count_of_mobile: 'quantity',
  total: 'quantity',

  // Notes / faults
  notes: 'notes',
  faults: 'notes',
  'faults/notes': 'notes',
  comments: 'notes',

  // Serial / IMEI
  serial_number: 'serial_number',
  serial: 'serial_number',
  imei: 'serial_number',
  's/n': 'serial_number',
  sn: 'serial_number',

  // Color
  color: 'color',
  colour: 'color',

  // Type
  order_type: 'order_type',
  type: 'order_type',
}

/** Build CSV content from headers and rows */
export function buildCsvContent(headers: readonly string[], rows: string[][]): string {
  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
}

/** Build a downloadable Excel template with a single sheet. */
export async function buildXlsxTemplateBlob(
  sheetName: string,
  headers: readonly string[],
  rows: string[][],
): Promise<Blob> {
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.default.Workbook()
  const ws = wb.addWorksheet(sheetName)
  ws.addRow(Array.from(headers))
  rows.forEach(row => ws.addRow(row))
  const arrayBuffer = await wb.xlsx.writeBuffer()
  return new Blob([arrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

/** Parse a CSV, TSV, Excel, or any tabular file into normalized header/value records.
 *  Excel-family extensions (.xlsx, .xlsm, .xls, .ods, etc.) are tried via ExcelJS first;
 *  any failure falls through to PapaParse which auto-detects comma/tab/semicolon/pipe.
 *  Text-like extensions (.csv, .tsv, .txt, .dat) go straight to PapaParse.
 *  No row count limit is enforced here — the caller decides how many rows to use.
 */
export async function parseTabularUpload(file: File): Promise<ParsedTabularUpload> {
  const ext = file.name.toLowerCase().split('.').pop() ?? ''
  const isExcelFamily = ['xlsx', 'xlsm', 'xlsb', 'xltx', 'xltm', 'xls', 'ods', 'numbers'].includes(ext)

  if (isExcelFamily) {
    try {
      const ExcelJS = await import('exceljs')
      const arrayBuffer = await file.arrayBuffer()
      const wb = new ExcelJS.default.Workbook()
      await wb.xlsx.load(arrayBuffer)

      const ws = wb.worksheets[0]
      if (!ws) throw new Error('Excel file does not contain a worksheet')

      const colCount = Math.max(ws.columnCount, 1)
      const raw: unknown[][] = []
      ws.eachRow({ includeEmpty: false }, (row) => {
        const cells: unknown[] = []
        for (let c = 1; c <= colCount; c++) {
          const cell = row.getCell(c)
          let val: unknown = cell.value
          if (val && typeof val === 'object' && 'result' in (val as Record<string, unknown>)) val = (val as { result: unknown }).result
          if (val && typeof val === 'object' && 'richText' in (val as Record<string, unknown>)) val = (val as { richText: Array<{ text: string }> }).richText.map(t => t.text).join('')
          cells.push(val ?? '')
        }
        raw.push(cells)
      })

      if (!raw || raw.length < 2) throw new Error('Excel file must have a header row and at least one data row')

      // Auto-detect the real header row — Excel files often have a title row before
      // the actual column headers. Score each of the first 10 rows by counting cells
      // that match a known column alias; the highest-scoring row wins.
      const detectHeaderRow = (rows: unknown[][]): number => {
        let best = { index: 0, score: -1 }
        const limit = Math.min(rows.length, 10)
        for (let i = 0; i < limit; i++) {
          let score = 0
          for (const cell of rows[i]) {
            const v = String(cell ?? '').toLowerCase().trim().replace(/\s+/g, ' ')
            if (v && CSV_COLUMN_ALIASES[v]) score += 3
            else if (v && /^(type|make|model|brand|qty|quantity|condition|storage|notes|serial|imei|sn|color|colour|s\/n)$/.test(v)) score += 2
            else if (v && /\b(make|model|brand|qty|quantity|condition|storage|serial|imei)\b/.test(v)) score += 1
          }
          if (score > best.score) best = { index: i, score }
        }
        // Only trust the auto-detected row if it has meaningful score (≥2)
        return best.score >= 2 ? best.index : 0
      }

      const headerRowIndex = detectHeaderRow(raw)
      const headers = raw[headerRowIndex].map((value, index) => String(value ?? '').trim() || `column_${index + 1}`)
      const rows = raw
        .slice(headerRowIndex + 1)
        .filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''))
        .map((row) => {
          const record: Record<string, string> = {}
          headers.forEach((header, index) => { record[header] = String(row[index] ?? '').trim() })
          return record
        })

      return { headers, rows }
    } catch {
      // ExcelJS could not read the file (e.g. legacy .xls binary or .ods) —
      // fall through and let PapaParse try to treat it as text.
    }
  }

  // CSV, TSV, TXT, or any Excel that ExcelJS couldn't parse — auto-detect delimiter.
  const { default: Papa } = await import('papaparse')
  const text = await file.text()
  return await new Promise<ParsedTabularUpload>((resolve, reject) => {
    Papa.parse<Record<string, string>>(text, {
      header: true,
      skipEmptyLines: true,
      delimiter: '', // auto-detect: comma, tab, semicolon, or pipe
      complete: (results) => {
        const rows = (results.data as Record<string, string>[]).map((row) => {
          const normalized: Record<string, string> = {}
          for (const [key, value] of Object.entries(row)) {
            normalized[key] = String(value ?? '').trim()
          }
          return normalized
        })

        resolve({
          headers: results.meta.fields || [],
          rows,
        })
      },
      error: (err: Error) => reject(err),
    })
  })
}
