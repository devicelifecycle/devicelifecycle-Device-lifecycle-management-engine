// ============================================================================
// VAR USAGE API — the caller's own tenant usage vs plan limits
// ============================================================================

import { NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { resolveLicense } from '@/lib/licensing'
import { buildUsageReport, overLimitMetrics } from '@/lib/usage'
export const dynamic = 'force-dynamic'

const VAR_CONSOLE_ROLES = new Set(['admin', 'var_entity_admin', 'var_regional_manager', 'var_sales_rep'])

export async function GET() {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  if (!VAR_CONSOLE_ROLES.has(auth.effectiveRole)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const tenantId = auth.tenantId
  if (!tenantId) return NextResponse.json({ error: 'No tenant in scope' }, { status: 400 })

  const supabase = createServiceRoleClient()
  const [tenantRes, custCount, userCount] = await Promise.all([
    supabase.from('tenants').select('settings').eq('id', tenantId).maybeSingle(),
    supabase.from('customers').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('is_active', true),
    supabase.from('users').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
  ])

  const license = resolveLicense((tenantRes.data?.settings as { license?: unknown } | null)?.license)
  const report = buildUsageReport({ customers: custCount.count ?? 0, users: userCount.count ?? 0 }, license)

  return NextResponse.json({ data: { report, overLimit: overLimitMetrics(report) } })
}
