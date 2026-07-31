// ============================================================================
// VAR SELF-SERVICE MARGINS — a VAR sets its own corp/rep margins
// ============================================================================
// The outline: VAR sets its Commission/Margin model via Input Tab fields. This
// writes ONLY the VAR-controlled corp/rep margins into the caller's own tenant;
// BB's platform commission / product margin / holdback stay untouched (BB-only).

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { hasPermission, type PermissionKey } from '@/lib/permissions'
import { commissionConfigFromSettings } from '@/lib/commission'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

const marginSchema = z.object({
  type: z.enum(['fixed', 'percent']),
  value: z.number().min(0).max(1_000_000),
})
const patchSchema = z.object({
  corpMargin: marginSchema.optional(),
  repMargin: marginSchema.optional(),
})

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()

  const allowed = auth.effectiveRole === 'admin'
    || hasPermission(auth.effectiveRole, 'commission.var_margins' as PermissionKey)
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const tenantId = auth.tenantId
  if (!tenantId) return NextResponse.json({ error: 'No tenant in scope' }, { status: 400 })

  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
  }
  if (!parsed.data.corpMargin && !parsed.data.repMargin) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const supabase = createServiceRoleClient()
  const { data: tenant, error: fetchErr } = await supabase
    .from('tenants').select('settings').eq('id', tenantId).maybeSingle()
  if (fetchErr || !tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })

  const settings = { ...(tenant.settings as Record<string, unknown> ?? {}) }
  const commission = { ...(settings.commission as Record<string, unknown> ?? {}) }
  if (parsed.data.corpMargin) commission.corpMargin = parsed.data.corpMargin
  if (parsed.data.repMargin) commission.repMargin = parsed.data.repMargin
  settings.commission = commission

  const { error } = await supabase.from('tenants').update({ settings }).eq('id', tenantId)
  if (error) {
    console.error('Failed to update VAR margins:', error)
    return NextResponse.json({ error: 'Failed to update margins' }, { status: 500 })
  }
  // Return the resolved config so BB commission fields are visibly preserved.
  return NextResponse.json({ data: commissionConfigFromSettings(settings) })
}
