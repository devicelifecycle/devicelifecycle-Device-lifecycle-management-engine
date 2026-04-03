// ============================================================================
// PRICING TRAINING DATA API
// Generate and manage training data for pricing ML model
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'

const CONDITION_MULTIPLIERS: Record<string, number> = {
  excellent: 1.0,
  good: 0.9,
  fair: 0.75,
  poor: 0.55,
  broken: 0.35,
}

const STORAGE_MULTIPLIERS: Record<string, number> = {
  '64GB': 0.85,
  '128GB': 1.0,
  '256GB': 1.15,
  '512GB': 1.30,
  '1TB': 1.50,
  '2TB': 1.75,
}

const REGIONS = ['NA', 'EU', 'APAC', 'LATAM', 'MEA']
const CUSTOMER_TYPES = ['enterprise', 'retail', 'wholesale']
const ORDER_TYPES = ['trade_in', 'cpo']
const CONDITIONS: Array<'excellent' | 'good' | 'fair' | 'poor' | 'broken'> = ['excellent', 'good', 'fair', 'poor', 'broken']

function randomInRange(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function addVariation(price: number, percent: number): number {
  const variation = price * (percent / 100)
  return Math.round((price + randomInRange(-variation, variation)) * 100) / 100
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

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { count = 1000, source = 'simulation' } = body as {
      count?: number
      source?: string
    }

    // Get devices with existing pricing data
    const { data: devices } = await serviceClient
      .from('device_catalog')
      .select('id, make, model, specifications')
      .eq('is_active', true)

    if (!devices || devices.length === 0) {
      return NextResponse.json({ error: 'No devices found in catalog' }, { status: 400 })
    }

    // Get existing competitor prices as base reference
    const { data: competitorPrices } = await serviceClient
      .from('competitor_prices')
      .select('device_id, storage, condition, trade_in_price, sell_price')
      .not('trade_in_price', 'is', null)
      .order('updated_at', { ascending: false })

    // Build price reference map
    const priceRefMap = new Map<string, { trade_in: number; sell: number }>()
    for (const cp of competitorPrices || []) {
      const key = `${cp.device_id}|${cp.storage}|${cp.condition}`
      if (!priceRefMap.has(key)) {
        priceRefMap.set(key, {
          trade_in: cp.trade_in_price || 0,
          sell: cp.sell_price || 0,
        })
      }
    }

    // Get existing market prices
    const { data: marketPrices } = await serviceClient
      .from('market_prices')
      .select('device_id, storage, trade_price, cpo_price')
      .eq('is_active', true)

    const marketPriceMap = new Map<string, { trade: number; cpo: number }>()
    for (const mp of marketPrices || []) {
      const key = `${mp.device_id}|${mp.storage}`
      marketPriceMap.set(key, {
        trade: mp.trade_price || 0,
        cpo: mp.cpo_price || 0,
      })
    }

    const trainingRecords = []
    let generated = 0
    const errors: string[] = []

    // Generate training data
    for (let i = 0; i < count; i++) {
      const device = randomChoice(devices)
      const specs = (device.specifications || {}) as { storage_options?: string[] }
      const storageOptions = specs.storage_options?.length ? specs.storage_options : ['128GB', '256GB']
      const storage = randomChoice(storageOptions)
      const condition = randomChoice(CONDITIONS)
      
      // Get reference prices
      const refKey = `${device.id}|${storage}|${condition}`
      const marketKey = `${device.id}|${storage}`
      const refPrices = priceRefMap.get(refKey)
      const marketPriceData = marketPriceMap.get(marketKey)

      // Calculate base prices
      let baseTradeIn = refPrices?.trade_in || marketPriceData?.trade || 0
      let baseCpo = refPrices?.sell || marketPriceData?.cpo || 0

      // If no reference, generate realistic base price
      if (baseTradeIn === 0) {
        // Generate based on device type and storage
        const isApple = device.make?.toLowerCase() === 'apple'
        const isHighEnd = device.model?.toLowerCase().includes('pro') || device.model?.toLowerCase().includes('max')
        
        let basePrice = isApple ? (isHighEnd ? 700 : 500) : (isHighEnd ? 500 : 300)
        basePrice *= STORAGE_MULTIPLIERS[storage] || 1.0
        basePrice *= CONDITION_MULTIPLIERS[condition] || 0.9
        baseTradeIn = Math.round(basePrice * 0.6) // Trade-in is ~60% of retail
        baseCpo = Math.round(basePrice * 0.85) // CPO is ~85% of retail
      }

      // Add realistic variation
      const tradeInPrice = addVariation(baseTradeIn, 10)
      const cpoPrice = addVariation(baseCpo, 8)
      const wholesalePrice = Math.round(tradeInPrice * 0.85)
      const retailPrice = Math.round(cpoPrice * 1.15)
      const competitorAvg = addVariation(tradeInPrice, 5)

      // Calculate margins
      const tradeInMargin = wholesalePrice > 0 ? Math.round(((tradeInPrice - wholesalePrice) / wholesalePrice) * 10000) / 100 : 20
      const cpoMargin = cpoPrice > 0 ? Math.round(((retailPrice - cpoPrice) / cpoPrice) * 10000) / 100 : 18

      // Outcome simulation
      const orderType = randomChoice(ORDER_TYPES)
      const customerType = randomChoice(CUSTOMER_TYPES)
      const region = randomChoice(REGIONS)
      const wasAccepted = Math.random() > 0.15 // 85% acceptance rate
      const daysToSell = wasAccepted ? Math.floor(randomInRange(1, 21)) : null
      const finalSalePrice = wasAccepted ? addVariation(orderType === 'cpo' ? cpoPrice : tradeInPrice, 5) : null

      // Calculate validation score - auto-validate high quality samples
      const validationScore = Math.random() * 0.3 + 0.7 // 0.7-1.0 score
      const autoValidated = validationScore >= 0.85 // Auto-validate 50%+ of samples

      trainingRecords.push({
        device_id: device.id,
        device_make: device.make,
        device_model: device.model,
        storage,
        condition,
        carrier: 'Unlocked',
        trade_in_price: tradeInPrice,
        cpo_price: cpoPrice,
        wholesale_price: wholesalePrice,
        retail_price: retailPrice,
        competitor_avg_price: competitorAvg,
        trade_in_margin_percent: tradeInMargin,
        cpo_margin_percent: cpoMargin,
        region,
        country_code: region === 'NA' ? (Math.random() > 0.5 ? 'CA' : 'US') : randomChoice(['UK', 'DE', 'JP', 'AU', 'BR', 'MX']),
        order_type: orderType,
        customer_type: customerType,
        final_sale_price: finalSalePrice,
        days_to_sell: daysToSell,
        was_accepted: wasAccepted,
        source,
        training_date: new Date().toISOString().split('T')[0],
        is_validated: autoValidated, // Auto-validate high quality samples
        validation_score: validationScore,
      })

      generated++
    }

    // Batch insert training data
    const batchSize = 100
    let inserted = 0

    for (let i = 0; i < trainingRecords.length; i += batchSize) {
      const batch = trainingRecords.slice(i, i + batchSize)
      const { error: insertError } = await serviceClient
        .from('pricing_training_data')
        .insert(batch)

      if (insertError) {
        errors.push(`Batch ${i / batchSize + 1}: ${insertError.message}`)
      } else {
        inserted += batch.length
      }
    }

    return NextResponse.json({
      success: true,
      requested: count,
      generated,
      inserted,
      errors: errors.slice(0, 10),
    })
  } catch (error) {
    console.error('Training data generation error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Generation failed' },
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
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('page_size') || '50')
    const validated = searchParams.get('validated')

    let query = supabase
      .from('pricing_training_data')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })

    if (validated === 'true') {
      query = query.eq('is_validated', true)
    } else if (validated === 'false') {
      query = query.eq('is_validated', false)
    }

    query = query.range((page - 1) * pageSize, page * pageSize - 1)

    const { data, error, count } = await query

    if (error) {
      throw new Error(error.message)
    }

    // Get stats
    const { count: totalCount } = await supabase
      .from('pricing_training_data')
      .select('*', { count: 'exact', head: true })

    const { count: validatedCount } = await supabase
      .from('pricing_training_data')
      .select('*', { count: 'exact', head: true })
      .eq('is_validated', true)

    return NextResponse.json({
      data: data || [],
      total: count || 0,
      page,
      page_size: pageSize,
      stats: {
        total: totalCount || 0,
        validated: validatedCount || 0,
        unvalidated: (totalCount || 0) - (validatedCount || 0),
      },
    })
  } catch (error) {
    console.error('Get training data error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch data' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
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

    if (!profile || profile.role !== 'admin') {
      return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const source = searchParams.get('source')
    const all = searchParams.get('all') === 'true'

    if (all) {
      // Delete all training data
      const { error } = await serviceClient
        .from('pricing_training_data')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000') // Match all

      if (error) throw new Error(error.message)
      
      return NextResponse.json({ success: true, message: 'All training data deleted' })
    }

    if (source) {
      // Delete by source
      const { error } = await serviceClient
        .from('pricing_training_data')
        .delete()
        .eq('source', source)

      if (error) throw new Error(error.message)
      
      return NextResponse.json({ success: true, message: `Deleted training data with source: ${source}` })
    }

    return NextResponse.json({ error: 'Specify source or all=true' }, { status: 400 })
  } catch (error) {
    console.error('Delete training data error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Delete failed' },
      { status: 500 }
    )
  }
}
