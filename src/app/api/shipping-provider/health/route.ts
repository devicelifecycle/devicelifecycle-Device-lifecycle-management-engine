// ============================================================================
// SHIPPING PROVIDER HEALTH CHECK API
// ============================================================================

import { NextResponse } from 'next/server'
import { ShippingProviderService } from '@/services/shipping-provider.service'
import { getActiveShippingProvider } from '@/services/shipment.service'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const provider = getActiveShippingProvider()
    const health = await ShippingProviderService.healthCheck()

    return NextResponse.json({
      provider,
      shipping_provider: health,
      isActive: provider === 'shipping_provider',
    })
  } catch (error) {
    return NextResponse.json({
      provider: getActiveShippingProvider(),
      shipping_provider: {
        keyConfigured: Boolean(process.env.STALLION_API_TOKEN),
        apiReachable: false,
        keyValid: false,
        message: error instanceof Error ? error.message : 'Health check failed',
      },
      isActive: false,
    })
  }
}
