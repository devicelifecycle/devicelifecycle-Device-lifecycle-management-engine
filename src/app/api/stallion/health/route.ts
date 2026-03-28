// ============================================================================
// STALLION EXPRESS HEALTH CHECK API
// ============================================================================

import { NextResponse } from 'next/server'
import { StallionService } from '@/services/stallion.service'
import { getActiveShippingProvider } from '@/services/shipment.service'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const provider = getActiveShippingProvider()
    const health = await StallionService.healthCheck()

    return NextResponse.json({
      provider,
      stallion: health,
      isActive: provider === 'stallion',
    })
  } catch (error) {
    return NextResponse.json({
      provider: getActiveShippingProvider(),
      stallion: {
        keyConfigured: Boolean(process.env.STALLION_API_TOKEN),
        apiReachable: false,
        keyValid: false,
        message: error instanceof Error ? error.message : 'Health check failed',
      },
      isActive: false,
    })
  }
}
