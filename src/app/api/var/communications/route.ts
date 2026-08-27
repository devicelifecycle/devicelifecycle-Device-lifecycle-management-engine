// ============================================================================
// VAR / ADMIN COMMUNICATIONS — per-tenant email + SMS sender settings
// ============================================================================
// Reads/writes the emailFromName / emailFromAddress / smsSenderId fields stored
// inside the tenant's `branding` JSONB. VAR entity admins manage their own
// tenant; platform admins may target any tenant via ?tenant_id.
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const patchSchema = z.object({
  emailFromName: z.string().max(120).optional().nullable(),
  emailFromAddress: z.string().email().optional().nullable(),
  smsSenderId: z.string().max(40).optional().nullable(),
  tenant_id: z.string().uuid().optional(), // admin only
})

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  const admin = auth.effectiveRole === 'admin'
  if (!admin && auth.effectiveRole !== 'var_entity_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const tenantId = admin ? req.nextUrl.searchParams.get('tenant_id') : auth.tenantId
  if (!tenantId) return NextResponse.json({ error: 'Missing tenant' }, { status: 400 })

  const supabase = createServiceRoleClient()
  const { data, error } = await supabase.from('tenants').select('branding').eq('id', tenantId).maybeSingle()
  if (error) return NextResponse.json({ error: 'Failed to load tenant' }, { status: 500 })
  const b = (data?.branding as Record<string, unknown>) || {}
  return NextResponse.json({
    tenant_id: tenantId,
    branding: {
      emailFromName: b.emailFromName ?? null,
      emailFromAddress: b.emailFromAddress ?? null,
      smsSenderId: b.smsSenderId ?? null,
      name: b.name ?? null,
    },
  })
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  const admin = auth.effectiveRole === 'admin'
  if (!admin && auth.effectiveRole !== 'var_entity_admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const parsed = patchSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
  }

  const tenantId = admin ? parsed.data.tenant_id : auth.tenantId
  if (!tenantId) return NextResponse.json({ error: 'A tenant_id is required' }, { status: 400 })

  const supabase = createServiceRoleClient()
  const { data: current, error: loadErr } = await supabase
    .from('tenants')
    .select('branding')
    .eq('id', tenantId)
    .maybeSingle()
  if (loadErr) return NextResponse.json({ error: 'Failed to load tenant' }, { status: 500 })

  const existing = (current?.branding as Record<string, unknown>) || {}
  const merged = {
    ...existing,
    emailFromName: parsed.data.emailFromName ?? existing.emailFromName ?? null,
    emailFromAddress: parsed.data.emailFromAddress ?? existing.emailFromAddress ?? null,
    smsSenderId: parsed.data.smsSenderId ?? existing.smsSenderId ?? null,
  }

  const { error } = await supabase.from('tenants').update({ branding: merged }).eq('id', tenantId)
  if (error) return NextResponse.json({ error: 'Failed to update communications settings' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
