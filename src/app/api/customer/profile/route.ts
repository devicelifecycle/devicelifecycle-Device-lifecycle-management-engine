// ============================================================================
// CUSTOMER COMPANY PROFILE API — get / update (tenant-scoped)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { resolveCompanyProfile } from '@/lib/company-profile'
import { resolveOwnCustomerId } from '@/lib/customer-self-scope'
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
  if (auth.effectiveRole === 'vendor') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  let customerId = new URL(request.url).searchParams.get('customer_id')
  if (auth.effectiveRole === 'customer') {
    const own = await resolveOwnCustomerId(auth)
    if (!own.ok) return own.response
    customerId = own.customerId
  }
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
  if (auth.effectiveRole === 'vendor') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })

  // A plain 'customer' account may only update its own company profile,
  // regardless of what customer_id it supplied.
  let customerId = parsed.data.customer_id
  if (auth.effectiveRole === 'customer') {
    const own = await resolveOwnCustomerId(auth)
    if (!own.ok) return own.response
    customerId = own.customerId
  }

  // Normalize + sanitize before storing, so only valid, capped data is saved.
  const profile = resolveCompanyProfile(parsed.data.profile)

  const supabase = createServiceRoleClient()
  let up = supabase.from('customers').update({ company_profile: profile }).eq('id', customerId)
  const scoped = onlyTenantId(auth)
  if (scoped) up = up.eq('tenant_id', scoped)
  const { data, error } = await up.select('id').single()
  if (error || !data) return NextResponse.json({ error: 'Failed to save profile' }, { status: error ? 500 : 404 })
  return NextResponse.json({ data: { profile } })
}
