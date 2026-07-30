// ============================================================================
// ADMIN COMMISSION CONFIG API
// GET/PATCH the commission + margin model for the current tenant.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { commissionConfigFromSettings } from '@/lib/commission'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

const PLATFORM_TENANT_ID = 'a0000000-0000-4000-a000-0000000000bb'

const marginSpec = z.object({
  type: z.enum(['fixed', 'percent']),
  value: z.number().min(0).max(1_000_000),
})
const configSchema = z.object({
  platformCommissionPct: z.number().min(0).max(1),
  productMarginPct: z.number().min(0).max(1),
  corpMargin: marginSpec,
  repMargin: marginSpec,
})

export async function GET() {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  if (auth.effectiveRole !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const tenantId = auth.tenantId ?? PLATFORM_TENANT_ID
  const supabase = createServiceRoleClient()
  const { data } = await supabase.from('tenants').select('settings').eq('id', tenantId).single()
  return NextResponse.json({ config: commissionConfigFromSettings(data?.settings), tenantId })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  if (auth.effectiveRole !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = configSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
  }

  const tenantId = auth.tenantId ?? PLATFORM_TENANT_ID
  const supabase = createServiceRoleClient()
  const { data: current } = await supabase.from('tenants').select('settings').eq('id', tenantId).single()
  const settings = { ...((current?.settings as Record<string, unknown>) ?? {}), commission: parsed.data }

  const { error } = await supabase
    .from('tenants')
    .update({ settings, updated_at: new Date().toISOString() })
    .eq('id', tenantId)

  if (error) {
    console.error('Failed to save commission config:', error)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
  return NextResponse.json({ config: parsed.data })
}
