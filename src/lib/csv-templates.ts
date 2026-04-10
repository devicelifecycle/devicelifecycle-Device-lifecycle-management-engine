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
  make: 'device_make',
  brand: 'device_make',
  manufacturer: 'device_make',
  model: 'device_model',
  device: 'device_model',
  product: 'device_model',
  storage: 'storage',
  'storage/gb': 'storage',
  capacity: 'storage',
  condition: 'condition',
  condtion: 'condition',
  quantity: 'quantity',
  qty: 'quantity',
  notes: 'notes',
  faults: 'notes',
  'faults/notes': 'notes',
  serial_number: 'serial_number',
  serial: 'serial_number',
  imei: 'serial_number',
  color: 'color',
  colour: 'color',
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
  const XLSX = await import('xlsx')
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.aoa_to_sheet([Array.from(headers), ...rows])
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)

  const arrayBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' })
  return new Blob([arrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
}

/** Parse a CSV or Excel file into normalized header/value records. */
export async function parseTabularUpload(file: File): Promise<ParsedTabularUpload> {
  const ext = file.name.toLowerCase().split('.').pop() ?? ''

  if (ext === 'xlsx' || ext === 'xls') {
    const XLSX = await import('xlsx')
    const arrayBuffer = await file.arrayBuffer()
    const workbook = XLSX.read(arrayBuffer, { type: 'array' })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    if (!sheet) {
      throw new Error('Excel file does not contain a worksheet')
    }

    const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][]
    if (!raw || raw.length < 2) {
      throw new Error('Excel file must have a header row and at least one data row')
    }

    const headers = raw[0].map((value, index) => String(value ?? '').trim() || `column_${index + 1}`)
    const rows = raw
      .slice(1)
      .filter((row) => row.some((cell) => String(cell ?? '').trim() !== ''))
      .map((row) => {
        const record: Record<string, string> = {}
        headers.forEach((header, index) => {
          record[header] = String(row[index] ?? '').trim()
        })
        return record
      })

    return { headers, rows }
  }

  if (ext !== 'csv') {
    throw new Error('Supported formats: CSV, Excel (.xlsx/.xls)')
  }

  const { default: Papa } = await import('papaparse')
  return await new Promise<ParsedTabularUpload>((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
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
      error: (error) => reject(error),
    })
  })
}
