// ============================================================================
// PUBLIC DEVICE SEARCH — no auth required. Backs the public device-value
// lookup tool. Exposes only make/model/category, never pricing internals.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { checkRateLimitAsync, getClientIp, RATE_LIMITS } from '@/lib/rate-limit'
import { sanitizeSearchInput } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const rl = await checkRateLimitAsync(`public-device-search:${getClientIp(request)}`, RATE_LIMITS.public)
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  const q = sanitizeSearchInput(request.nextUrl.searchParams.get('q')?.trim() || '')
  if (q.length < 2) {
    return NextResponse.json({ data: [] })
  }

  const serviceRole = createServiceRoleClient()
  const { data } = await serviceRole
    .from('device_catalog')
    .select('id, make, model, category')
    .eq('is_active', true)
    .or(`make.ilike.%${q}%,model.ilike.%${q}%`)
    .order('make')
    .limit(15)

  return NextResponse.json({ data: data || [] })
}
