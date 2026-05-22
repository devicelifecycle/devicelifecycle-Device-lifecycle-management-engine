// ============================================================================
// SHIPPING PROVIDER HEALTH CHECK API
// ============================================================================

import { NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { ShippingProviderService } from '@/services/shipping-provider.service'
import { getActiveShippingProvider } from '@/services/shipment.service'
export const dynamic = 'force-dynamic'

export async function GET() {
  const auth = await requireAuth()
  if (!auth) return unauthorized()

  if (!['admin', 'coe_manager'].includes(auth.profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const provider = getActiveShippingProvider()
    const health = await ShippingProviderService.healthCheck()

    return NextResponse.json({
      provider,
      shipping_provider: health,
      isActive: provider === 'shipping_provider',
    })
  } catch {
    return NextResponse.json({
      provider: getActiveShippingProvider(),
      shipping_provider: {
        keyConfigured: Boolean(process.env.STALLION_API_TOKEN),
        apiReachable: false,
        keyValid: false,
        message: 'Health check failed',
      },
      isActive: false,
    })
  }
}
