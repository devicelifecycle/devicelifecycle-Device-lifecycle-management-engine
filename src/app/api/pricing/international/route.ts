// ============================================================================
// INTERNATIONAL PRICING UPLOAD API
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

interface InternationalPriceRow {
  device_make: string
  device_model: string
  storage: string
  condition: string
  trade_in_price?: string | number
  cpo_price?: string | number
  wholesale_price?: string | number
  retail_price?: string | number
  region: string
  country_code: string
  currency?: string
  exchange_rate?: string | number
}

function normalizeCondition(input?: string): 'excellent' | 'good' | 'fair' | 'poor' | 'broken' {
  const value = (input || '').toLowerCase().trim()
  if (value === 'excellent' || value === 'new' || value === 'a') return 'excellent'
  if (value === 'good' || value === 'b') return 'good'
  if (value === 'fair' || value === 'c') return 'fair'
  if (value === 'poor' || value === 'd') return 'poor'
  if (value === 'broken' || value === 'f') return 'broken'
  return 'good'
}

function normalizeStorage(input?: string): string {
  return (input || '128GB').trim().replace(/\s+/g, '').toUpperCase()
}

function normalizeRegion(input?: string): string {
  const value = (input || '').toUpperCase().trim()
  if (['NA', 'NORTH AMERICA', 'US', 'CA', 'CANADA', 'USA'].includes(value)) return 'NA'
  if (['EU', 'EUROPE', 'EUR'].includes(value)) return 'EU'
  if (['APAC', 'ASIA', 'ASIA PACIFIC', 'JP', 'CN', 'AU'].includes(value)) return 'APAC'
  if (['LATAM', 'LATIN AMERICA', 'SOUTH AMERICA', 'SA'].includes(value)) return 'LATAM'
  if (['MEA', 'MIDDLE EAST', 'AFRICA', 'EMEA'].includes(value)) return 'MEA'
  return 'NA'
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const serviceClient = createServiceRoleClient()

    // Verify admin role
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'coe_manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { rows, region, country_code, filename } = body as {
      rows: InternationalPriceRow[]
      region?: string
      country_code?: string
      filename?: string
    }

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No data rows provided' }, { status: 400 })
    }

    // Create upload record
    const { data: upload, error: uploadError } = await serviceClient
      .from('pricing_uploads')
      .insert({
        filename: filename || 'international_pricing.csv',
        file_type: 'csv',
        total_rows: rows.length,
        processed_rows: 0,
        error_rows: 0,
        upload_type: 'international',
        region: region ? normalizeRegion(region) : undefined,
        country_code: country_code,
        status: 'processing',
        created_by_id: user.id,
      })
      .select()
      .single()

    if (uploadError) {
      console.error('Failed to create upload record:', uploadError)
    }

    // Get device catalog for matching
    const { data: devices } = await serviceClient
      .from('device_catalog')
      .select('id, make, model')
      .eq('is_active', true)

    const deviceMap = new Map<string, string>()
    for (const d of devices || []) {
      const key = `${(d.make || '').toLowerCase()}|${(d.model || '').toLowerCase()}`
      deviceMap.set(key, d.id)
    }

    const results = {
      processed: 0,
      errors: 0,
      warnings: [] as string[],
      errorDetails: [] as string[],
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      
      // Find device
      const deviceKey = `${(row.device_make || '').toLowerCase()}|${(row.device_model || '').toLowerCase()}`
      const deviceId = deviceMap.get(deviceKey)

      if (!deviceId) {
        results.errors++
        results.errorDetails.push(`Row ${i + 1}: Device not found - ${row.device_make} ${row.device_model}`)
        continue
      }

      // Parse prices
      const tradeInPrice = row.trade_in_price ? parseFloat(String(row.trade_in_price)) : null
      const cpoPrice = row.cpo_price ? parseFloat(String(row.cpo_price)) : null
      const wholesalePrice = row.wholesale_price ? parseFloat(String(row.wholesale_price)) : null
      const retailPrice = row.retail_price ? parseFloat(String(row.retail_price)) : null

      if (!tradeInPrice && !cpoPrice && !wholesalePrice && !retailPrice) {
        results.warnings.push(`Row ${i + 1}: No valid prices found`)
        continue
      }

      // Upsert international price
      const { error: priceError } = await serviceClient
        .from('international_prices')
        .upsert({
          device_id: deviceId,
          storage: normalizeStorage(row.storage),
          condition: normalizeCondition(row.condition),
          trade_in_price: tradeInPrice,
          cpo_price: cpoPrice,
          wholesale_price: wholesalePrice,
          retail_price: retailPrice,
          region: row.region ? normalizeRegion(row.region) : (region ? normalizeRegion(region) : 'NA'),
          country_code: row.country_code || country_code || 'CA',
          currency: row.currency || 'CAD',
          exchange_rate: row.exchange_rate ? parseFloat(String(row.exchange_rate)) : 1.0,
          source: 'manual_upload',
          upload_batch_id: upload?.id,
          effective_date: new Date().toISOString().split('T')[0],
          is_active: true,
          created_by_id: user.id,
        }, {
          onConflict: 'device_id,storage,condition,region,country_code,effective_date',
          ignoreDuplicates: false,
        })

      if (priceError) {
        results.errors++
        results.errorDetails.push(`Row ${i + 1}: ${priceError.message}`)
      } else {
        results.processed++
      }
    }

    // Update upload record
    if (upload?.id) {
      await serviceClient
        .from('pricing_uploads')
        .update({
          processed_rows: results.processed,
          error_rows: results.errors,
          warnings: results.warnings.slice(0, 50), // Limit stored warnings
          errors: results.errorDetails.slice(0, 50),
          status: results.errors === rows.length ? 'failed' : 'completed',
          processed_at: new Date().toISOString(),
        })
        .eq('id', upload.id)
    }

    return NextResponse.json({
      success: true,
      upload_id: upload?.id,
      total_rows: rows.length,
      processed: results.processed,
      errors: results.errors,
      warnings: results.warnings.slice(0, 10),
      error_details: results.errorDetails.slice(0, 10),
    })
  } catch (error) {
    console.error('International pricing upload error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()

    // Verify admin role
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || !['admin', 'coe_manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const region = searchParams.get('region')
    const countryCode = searchParams.get('country_code')
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('page_size') || '50')

    let query = supabase
      .from('international_prices')
      .select(`
        *,
        device:device_catalog(id, make, model)
      `, { count: 'exact' })
      .eq('is_active', true)
      .order('updated_at', { ascending: false })

    if (region) {
      query = query.eq('region', region)
    }
    if (countryCode) {
      query = query.eq('country_code', countryCode)
    }

    query = query.range((page - 1) * pageSize, page * pageSize - 1)

    const { data, error, count } = await query

    if (error) {
      throw new Error(error.message)
    }

    return NextResponse.json({
      data: data || [],
      total: count || 0,
      page,
      page_size: pageSize,
    })
  } catch (error) {
    console.error('Get international prices error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch prices' },
      { status: 500 }
    )
  }
}
