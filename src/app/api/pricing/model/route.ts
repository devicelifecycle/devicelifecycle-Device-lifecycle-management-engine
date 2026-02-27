// ============================================================================
// PRICING MODEL API
// ============================================================================
// Calculate price using a specific pricing model with its own logic.
// GET: List available models
// POST: Run a model's calculation

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PricingModelRegistry } from '@/models/pricing'
import { z } from 'zod'

const modelCalculateSchema = z.object({
  model_id: z.string().min(1),
  device_id: z.string().uuid(),
  storage: z.string().optional().default('128GB'),
  carrier: z.string().optional().default('Unlocked'),
  condition: z.enum(['new', 'excellent', 'good', 'fair', 'poor']),
  issues: z.array(z.string()).optional().default([]),
  quantity: z.number().min(1).optional().default(1),
  base_price: z.number().positive().optional(),
  purpose: z.enum(['buy', 'sell']).optional().default('buy'),
})

export async function GET() {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile && ['customer', 'vendor'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const models = PricingModelRegistry.list().map(m => ({
      id: m.id,
      name: m.name,
      description: m.description,
    }))

    return NextResponse.json({ models })
  } catch (error) {
    console.error('Pricing model list error:', error)
    return NextResponse.json({ error: 'Failed to list models' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile && ['customer', 'vendor'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const validation = modelCalculateSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.errors },
        { status: 400 }
      )
    }

    const { model_id, base_price, ...rest } = validation.data
    const model = PricingModelRegistry.get(model_id)

    if (!model) {
      return NextResponse.json(
        { error: `Unknown model: ${model_id}`, available: PricingModelRegistry.list().map(m => m.id) },
        { status: 400 }
      )
    }

    // If no base_price provided, try to fetch from pricing_tables or market_prices
    let resolvedBasePrice = base_price
    if (resolvedBasePrice == null && model.id === 'simple_margin') {
      const { data: pt } = await supabase
        .from('pricing_tables')
        .select('base_price')
        .eq('device_id', rest.device_id)
        .eq('storage', rest.storage)
        .eq('condition', 'new')
        .eq('carrier', rest.carrier)
        .eq('is_active', true)
        .order('effective_date', { ascending: false })
        .limit(1)
        .single()
      resolvedBasePrice = pt?.base_price
    }
    if (resolvedBasePrice == null) {
      const { data: mp } = await supabase
        .from('market_prices')
        .select('wholesale_c_stock')
        .eq('device_id', rest.device_id)
        .eq('storage', rest.storage)
        .eq('carrier', rest.carrier)
        .eq('is_active', true)
        .order('effective_date', { ascending: false })
        .limit(1)
        .single()
      resolvedBasePrice = mp?.wholesale_c_stock
    }

    const result = await Promise.resolve(model.calculate({
      ...rest,
      base_price: resolvedBasePrice,
    }))

    return NextResponse.json(result)
  } catch (error) {
    console.error('Pricing model calculate error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Calculation failed' },
      { status: 500 }
    )
  }
}
