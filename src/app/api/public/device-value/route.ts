// ============================================================================
// PUBLIC DEVICE VALUE LOOKUP — no auth required.
// Returns a rounded estimate range only — never the full pricing breakdown,
// competitor list, or channel/margin internals that authenticated pricing
// endpoints expose.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { PricingService } from '@/services/pricing.service'
import { checkRateLimit, getClientIp, RATE_LIMITS } from '@/lib/rate-limit'
import { isValidUUID } from '@/lib/utils'
import { DEVICE_CONDITION_VALUES } from '@/lib/validations'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const rl = checkRateLimit(`public-device-value:${getClientIp(request)}`, RATE_LIMITS.public)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const params = request.nextUrl.searchParams
  const deviceId = params.get('device_id') || ''
  const storage = params.get('storage') || '128GB'
  const condition = params.get('condition') || 'good'

  if (!isValidUUID(deviceId)) {
    return NextResponse.json({ error: 'Invalid device' }, { status: 400 })
  }
  if (!DEVICE_CONDITION_VALUES.includes(condition as typeof DEVICE_CONDITION_VALUES[number])) {
    return NextResponse.json({ error: 'Invalid condition' }, { status: 400 })
  }

  const serviceRole = createServiceRoleClient()
  const { data: device } = await serviceRole
    .from('device_catalog')
    .select('id, make, model')
    .eq('id', deviceId)
    .eq('is_active', true)
    .maybeSingle()

  if (!device) {
    return NextResponse.json({ error: 'Device not found' }, { status: 404 })
  }

  try {
    const calc = await PricingService.calculateAdaptivePrice(
      {
        device_id: deviceId,
        storage,
        carrier: 'Unlocked',
        condition: condition as typeof DEVICE_CONDITION_VALUES[number],
        quantity: 1,
      },
      serviceRole
    )

    if (!calc.success || calc.trade_price == null) {
      return NextResponse.json({
        device: { make: device.make, model: device.model },
        estimate_available: false,
      })
    }

    // Round to the nearest $5 and present as a range, not an exact figure —
    // useful for a casual visitor, not precise enough to be scraped as
    // competitive intelligence.
    const rounded = Math.round(calc.trade_price / 5) * 5
    const low = Math.max(0, Math.round((rounded * 0.9) / 5) * 5)
    const high = Math.round((rounded * 1.1) / 5) * 5

    return NextResponse.json({
      device: { make: device.make, model: device.model },
      estimate_available: true,
      estimate_low: low,
      estimate_high: high,
    })
  } catch (error) {
    console.error('Error calculating public device value:', error)
    return NextResponse.json({ error: 'Failed to estimate value' }, { status: 500 })
  }
}
