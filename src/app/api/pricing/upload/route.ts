// ============================================================================
// PRICING UPLOAD API - Bulk import pricing from CSV
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { sanitizeCsvCell, safeErrorMessage } from '@/lib/utils'
import { parse } from 'csv-parse/sync'

interface PricingRow {
  make: string
  model: string
  storage: string
  carrier: string
  condition: string
  base_price: string
  buy_price?: string
  sell_price?: string
  effective_date: string
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user has admin role
    const { data: userData } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!userData || !['admin', 'coe_manager'].includes(userData.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Parse the form data
    const formData = await request.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Security: Validate MIME type
    const allowedMimeTypes = ['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel']
    if (!allowedMimeTypes.includes(file.type)) {
      return NextResponse.json(
        { error: `Invalid file type. Only CSV files are allowed. Received: ${file.type}` },
        { status: 400 }
      )
    }

    // Security: Validate file size (10MB max)
    const maxSizeBytes = 10 * 1024 * 1024 // 10MB
    if (file.size > maxSizeBytes) {
      return NextResponse.json(
        { error: `File too large. Maximum size is 10MB. Received: ${(file.size / 1024 / 1024).toFixed(2)}MB` },
        { status: 400 }
      )
    }

    // Read file content
    const content = await file.text()

    // Parse CSV with security limits
    const records: PricingRow[] = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      to_line: 10000, // Security: Limit to 10,000 rows to prevent DOS
      relax_quotes: true,
      relax_column_count: true,
    })

    if (records.length === 0) {
      return NextResponse.json({ error: 'CSV file is empty' }, { status: 400 })
    }

    // Validate required columns
    const requiredColumns = ['make', 'model', 'storage', 'base_price', 'effective_date']
    const firstRecord = records[0]
    const missingColumns = requiredColumns.filter(col => !(col in firstRecord))
    
    if (missingColumns.length > 0) {
      return NextResponse.json({ 
        error: `Missing required columns: ${missingColumns.join(', ')}` 
      }, { status: 400 })
    }

    // Process each row
    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[],
    }

    for (let i = 0; i < records.length; i++) {
      const row = records[i]
      const rowNum = i + 2 // +2 because row 1 is header, and we're 0-indexed
      
      try {
        // Find or create device
        let deviceId: string | null = null
        
        // Check if device exists
        const { data: existingDevice } = await supabase
          .from('device_catalog')
          .select('id')
          .eq('make', row.make)
          .eq('model', row.model)
          .single()

        if (existingDevice) {
          deviceId = existingDevice.id
        } else {
          // Create new device
          const { data: newDevice, error: createError } = await supabase
            .from('device_catalog')
            .insert({
              make: row.make,
              model: row.model,
              category: detectCategory(row.model),
              is_active: true,
            })
            .select('id')
            .single()

          if (createError) {
            results.errors.push(`Row ${rowNum}: Failed to create device - ${createError.message}`)
            results.failed++
            continue
          }
          deviceId = newDevice.id
        }

        // Upsert pricing entry
        const { error: pricingError } = await supabase
          .from('pricing_tables')
          .upsert({
            device_id: deviceId,
            storage: row.storage,
            carrier: row.carrier || 'Unlocked',
            condition: row.condition || 'new',
            base_price: parseFloat(row.base_price),
            buy_price: row.buy_price ? parseFloat(row.buy_price) : null,
            sell_price: row.sell_price ? parseFloat(row.sell_price) : null,
            effective_date: row.effective_date,
            is_active: true,
          }, {
            onConflict: 'device_id,storage,carrier,condition',
          })

        if (pricingError) {
          results.errors.push(`Row ${rowNum}: Failed to save pricing - ${pricingError.message}`)
          results.failed++
        } else {
          results.success++
        }

      } catch (error) {
        results.errors.push(`Row ${rowNum}: ${safeErrorMessage(error, 'Unknown error')}`)
        results.failed++
      }
    }

    return NextResponse.json({
      message: 'Import complete',
      total: records.length,
      success: results.success,
      failed: results.failed,
      errors: results.errors.slice(0, 10), // Return first 10 errors only
    })

  } catch (error) {
    console.error('Pricing upload error:', error)
    return NextResponse.json(
      { error: safeErrorMessage(error, 'Failed to process file') },
      { status: 500 }
    )
  }
}

/**
 * Detect device category from model name
 */
function detectCategory(model: string): string {
  const modelLower = model.toLowerCase()
  
  if (modelLower.includes('iphone') || modelLower.includes('galaxy s') || 
      modelLower.includes('pixel') || modelLower.includes('fold') || 
      modelLower.includes('flip')) {
    return 'phone'
  }
  
  if (modelLower.includes('ipad') || modelLower.includes('tab')) {
    return 'tablet'
  }
  
  if (modelLower.includes('macbook') || modelLower.includes('laptop') || 
      modelLower.includes('thinkpad') || modelLower.includes('surface laptop')) {
    return 'laptop'
  }
  
  if (modelLower.includes('watch')) {
    return 'watch'
  }
  
  return 'other'
}

// GET - Download current pricing as CSV
export async function GET(_request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single()
    if (!profile || !['admin', 'coe_manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Get all pricing with device info
    const { data: pricing, error } = await supabase
      .from('pricing_tables')
      .select(`
        *,
        device:device_catalog(make, model)
      `)
      .eq('is_active', true)
      .order('device_id')

    if (error) {
      throw new Error(error.message)
    }

    // Convert to CSV with injection protection
    const headers = ['make', 'model', 'storage', 'carrier', 'condition', 'base_price', 'buy_price', 'sell_price', 'effective_date']
    const rows = pricing.map(p => [
      sanitizeCsvCell(p.device?.make || ''),
      sanitizeCsvCell(p.device?.model || ''),
      sanitizeCsvCell(p.storage || ''),
      sanitizeCsvCell(p.carrier || 'Unlocked'),
      sanitizeCsvCell(p.condition || 'new'),
      p.base_price || 0,
      p.buy_price || '',
      p.sell_price || '',
      sanitizeCsvCell(p.effective_date || ''),
    ])

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n')

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="pricing-export-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    })

  } catch (error) {
    console.error('Pricing export error:', error)
    return NextResponse.json(
      { error: safeErrorMessage(error, 'Failed to export pricing') },
      { status: 500 }
    )
  }
}
