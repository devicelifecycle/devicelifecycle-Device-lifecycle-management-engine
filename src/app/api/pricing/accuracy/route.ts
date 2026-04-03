// ============================================================================
// PRICING MODEL ACCURACY API
// Compares each registered model's predictions against actual completed order
// prices to compute real-world accuracy metrics (MAE, MAPE, sample count).
// ============================================================================

import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { PricingModelRegistry } from '@/models/pricing'
import { safeErrorMessage } from '@/lib/utils'
export const dynamic = 'force-dynamic'

interface AccuracyMetrics {
  model_id: string
  model_name: string
  sample_count: number
  mae: number          // Mean Absolute Error ($)
  mape: number         // Mean Absolute Percentage Error (%)
  within_10pct: number // % of predictions within 10% of actual
  avg_confidence: number
  computed_at: string
}

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: profile } = await supabase
      .from('users').select('role').eq('id', user.id).single()

    if (!profile || ['customer', 'vendor'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Pull completed orders with known final prices and device info
    const { data: orders } = await supabase
      .from('orders')
      .select(`
        id,
        final_amount,
        total_quantity,
        order_items (
          device_id,
          claimed_condition,
          storage,
          quantity,
          final_price
        )
      `)
      .eq('status', 'completed')
      .not('final_amount', 'is', null)
      .gt('final_amount', 0)
      .order('created_at', { ascending: false })
      .limit(200)

    if (!orders?.length) {
      return NextResponse.json({
        metrics: [],
        message: 'No completed orders with final prices found for accuracy evaluation.',
        sample_pool: 0,
      })
    }

    // Build evaluation dataset: each item with device + condition + actual price
    type EvalPoint = { device_id: string; condition: string; storage: string; actual_price: number }
    const evalPoints: EvalPoint[] = []

    for (const order of orders) {
      for (const item of (order.order_items as { device_id: string; claimed_condition: string; storage: string; quantity: number; final_price: number }[] | null) ?? []) {
        if (!item.device_id || !item.claimed_condition || !item.final_price) continue
        const unitPrice = Number(item.final_price) / Math.max(item.quantity ?? 1, 1)
        if (unitPrice <= 0) continue
        evalPoints.push({
          device_id: item.device_id,
          condition: item.claimed_condition,
          storage: item.storage || '128GB',
          actual_price: unitPrice,
        })
      }
    }

    if (!evalPoints.length) {
      return NextResponse.json({
        metrics: [],
        message: 'Completed orders found but no line items with pricing data.',
        sample_pool: 0,
      })
    }

    const models = PricingModelRegistry.list()
    const metrics: AccuracyMetrics[] = []

    for (const model of models) {
      let totalAbsError = 0
      let totalAbsPctError = 0
      let within10 = 0
      let totalConfidence = 0
      let evaluated = 0

      // Sample up to 50 points per model to keep response fast
      const sample = evalPoints.slice(0, 50)

      for (const point of sample) {
        try {
          const result = await model.calculate({
            device_id: point.device_id,
            condition: point.condition as 'new' | 'excellent' | 'good' | 'fair' | 'poor',
            storage: point.storage,
            quantity: 1,
            purpose: 'buy',
          })

          if (!result.success || !result.final_price || result.final_price <= 0) continue

          const predicted = result.final_price
          const actual = point.actual_price
          const absErr = Math.abs(predicted - actual)
          const absPctErr = (absErr / actual) * 100

          totalAbsError += absErr
          totalAbsPctError += absPctErr
          if (absPctErr <= 10) within10++
          totalConfidence += result.confidence ?? 0
          evaluated++
        } catch {
          // Skip failures — model may not have data for this device
        }
      }

      if (evaluated === 0) {
        metrics.push({
          model_id: model.id,
          model_name: model.name,
          sample_count: 0,
          mae: 0,
          mape: 0,
          within_10pct: 0,
          avg_confidence: 0,
          computed_at: new Date().toISOString(),
        })
        continue
      }

      metrics.push({
        model_id: model.id,
        model_name: model.name,
        sample_count: evaluated,
        mae: Math.round((totalAbsError / evaluated) * 100) / 100,
        mape: Math.round((totalAbsPctError / evaluated) * 10) / 10,
        within_10pct: Math.round((within10 / evaluated) * 1000) / 10,
        avg_confidence: Math.round((totalConfidence / evaluated) * 1000) / 10,
        computed_at: new Date().toISOString(),
      })
    }

    // Sort by lowest MAPE (best accuracy first)
    metrics.sort((a, b) => {
      if (a.sample_count === 0) return 1
      if (b.sample_count === 0) return -1
      return a.mape - b.mape
    })

    return NextResponse.json({
      metrics,
      sample_pool: evalPoints.length,
      evaluated_sample: Math.min(evalPoints.length, 50),
    })
  } catch (error) {
    console.error('[pricing/accuracy] Error:', error)
    return NextResponse.json({ error: safeErrorMessage(error, 'Failed to compute accuracy') }, { status: 500 })
  }
}
