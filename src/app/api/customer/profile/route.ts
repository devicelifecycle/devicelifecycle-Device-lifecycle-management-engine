// ============================================================================
// CUSTOMER COMPANY PROFILE API — get / update (tenant-scoped)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { resolveCompanyProfile } from '@/lib/company-profile'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  customer_id: z.string().uuid(),
  profile: z.record(z.unknown()),
})

function onlyTenantId(auth: { effectiveRole: string; tenantId: string | null }): string | null {
  return auth.effectiveRole !== 'admin' ? auth.tenantId : null
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  const customerId = new URL(request.url).searchParams.get('customer_id')
  if (!customerId) return NextResponse.json({ error: 'customer_id is required' }, { status: 400 })

  const supabase = createServiceRoleClient()
  let sel = supabase.from('customers').select('id, company_name, company_profile, tenant_id').eq('id', customerId)
  const scoped = onlyTenantId(auth)
  if (scoped) sel = sel.eq('tenant_id', scoped)
  const { data, error } = await sel.maybeSingle()
  if (error) return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ data: { customer_id: data.id, company_name: data.company_name, profile: resolveCompanyProfile(data.company_profile) } })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })

  // Normalize + sanitize before storing, so only valid, capped data is saved.
  const profile = resolveCompanyProfile(parsed.data.profile)

  const supabase = createServiceRoleClient()
  let up = supabase.from('customers').update({ company_profile: profile }).eq('id', parsed.data.customer_id)
  const scoped = onlyTenantId(auth)
  if (scoped) up = up.eq('tenant_id', scoped)
  const { data, error } = await up.select('id').single()
  if (error || !data) return NextResponse.json({ error: 'Failed to save profile' }, { status: error ? 500 : 404 })
  return NextResponse.json({ data: { profile } })
}
