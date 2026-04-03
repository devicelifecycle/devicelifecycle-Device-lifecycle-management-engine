// ============================================================================
// INTERNATIONAL PRICING - BULK CSV IMPORT API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PricingService } from '@/services/pricing.service'
import { safeErrorMessage } from '@/lib/utils'
export const dynamic = 'force-dynamic'


interface CsvRow {
  device_name: string
  storage: string
  trade_in_price?: string
  sell_price?: string
}

function parseCsv(text: string): { rows: CsvRow[]; parseErrors: string[] } {
  const parseErrors: string[] = []
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0)

  if (lines.length < 2) {
    parseErrors.push('CSV must have a header row and at least one data row')
    return { rows: [], parseErrors }
  }

  const headerLine = lines[0].toLowerCase().trim()
  const headers = headerLine.split(',').map(h => h.trim().replace(/^"|"$/g, ''))

  const deviceNameIdx = headers.indexOf('device_name')
  const storageIdx = headers.indexOf('storage')
  const tradeInIdx = headers.indexOf('trade_in_price')
  const sellIdx = headers.indexOf('sell_price')

  if (deviceNameIdx === -1) {
    parseErrors.push('Missing required column: device_name')
  }
  if (storageIdx === -1) {
    parseErrors.push('Missing required column: storage')
  }
  if (tradeInIdx === -1 && sellIdx === -1) {
    parseErrors.push('At least one of trade_in_price or sell_price columns is required')
  }
  if (parseErrors.length > 0) {
    return { rows: [], parseErrors }
  }

  const rows: CsvRow[] = []
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''))
    const deviceName = cells[deviceNameIdx]?.trim()
    const storage = cells[storageIdx]?.trim()

    if (!deviceName || !storage) {
      parseErrors.push(`Row ${i + 1}: missing device_name or storage`)
      continue
    }

    const tradeIn = tradeInIdx !== -1 ? cells[tradeInIdx]?.trim() : undefined
    const sell = sellIdx !== -1 ? cells[sellIdx]?.trim() : undefined

    if (!tradeIn && !sell) {
      parseErrors.push(`Row ${i + 1}: at least one price (trade_in_price or sell_price) is required`)
      continue
    }

    rows.push({
      device_name: deviceName,
      storage,
      trade_in_price: tradeIn || undefined,
      sell_price: sell || undefined,
    })
  }

  return { rows, parseErrors }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!['admin', 'coe_manager'].includes(profile?.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const csvText = body.csv

    if (!csvText || typeof csvText !== 'string') {
      return NextResponse.json({ error: 'Request body must include a "csv" string field' }, { status: 400 })
    }

    // Parse CSV
    const { rows, parseErrors } = parseCsv(csvText)
    const errors: string[] = [...parseErrors]

    if (rows.length === 0) {
      return NextResponse.json({
        imported: 0,
        skipped: 0,
        errors: errors.length > 0 ? errors : ['No valid rows found in CSV'],
      })
    }

    // Resolve device names to IDs
    const uniqueDeviceNames = Array.from(new Set(rows.map(r => r.device_name.toLowerCase())))

    // Fetch all matching devices from catalog
    const { data: catalogDevices, error: catalogError } = await supabase
      .from('device_catalog')
      .select('id, name')

    if (catalogError) {
      return NextResponse.json({ error: 'Failed to query device catalog' }, { status: 500 })
    }

    // Build case-insensitive lookup map
    const deviceNameToId = new Map<string, string>()
    for (const device of (catalogDevices || [])) {
      deviceNameToId.set((device.name || '').toLowerCase(), device.id)
    }

    // Resolve rows
    const resolvedRows: Array<{ device_id: string; storage: string; trade_in_price?: number; sell_price?: number }> = []
    let skipped = 0

    for (const row of rows) {
      const deviceId = deviceNameToId.get(row.device_name.toLowerCase())
      if (!deviceId) {
        errors.push(`Device not found in catalog: "${row.device_name}"`)
        skipped++
        continue
      }

      const tradeInPrice = row.trade_in_price ? parseFloat(row.trade_in_price) : undefined
      const sellPrice = row.sell_price ? parseFloat(row.sell_price) : undefined

      if ((row.trade_in_price && isNaN(tradeInPrice!)) || (row.sell_price && isNaN(sellPrice!))) {
        errors.push(`Invalid price value for "${row.device_name}" ${row.storage}`)
        skipped++
        continue
      }

      // Normalize storage: remove spaces, uppercase (e.g., "256 gb" -> "256GB")
      const normalizedStorage = row.storage.replace(/\s+/g, '').toUpperCase()

      resolvedRows.push({
        device_id: deviceId,
        storage: normalizedStorage,
        trade_in_price: tradeInPrice,
        sell_price: sellPrice,
      })
    }

    if (resolvedRows.length === 0) {
      return NextResponse.json({ imported: 0, skipped, errors })
    }

    // Bulk upsert
    const result = await PricingService.bulkUpsertCompetitorPrices(resolvedRows)

    return NextResponse.json({
      imported: result.imported,
      skipped,
      errors: [...errors, ...result.errors],
    })
  } catch (error) {
    console.error('Error importing international prices:', error)
    return NextResponse.json(
      { error: safeErrorMessage(error, 'Failed to import international prices') },
      { status: 500 }
    )
  }
}
