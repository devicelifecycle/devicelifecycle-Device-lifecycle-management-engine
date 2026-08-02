// ============================================================================
// CUSTOMER ASSETS API — list / register / update (tenant-scoped)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { canTransitionAsset, type AssetStatus } from '@/lib/assets'
import { parsePaging } from '@/lib/paging'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

const createSchema = z.object({
  customer_id: z.string().uuid(),
  label: z.string().min(1).max(200),
  serial_number: z.string().max(120).optional(),
  device_id: z.string().uuid().optional().nullable(),
  location: z.string().max(160).optional(),
  assigned_to: z.string().max(160).optional(),
  notes: z.string().max(2000).optional(),
})
const patchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['registered', 'assigned', 'retired']).optional(),
  assigned_to: z.string().max(160).nullable().optional(),
  location: z.string().max(160).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
})

// Non-admins are restricted to their own tenant (service role bypasses RLS).
function tenantScoped(auth: { effectiveRole: string; tenantId: string | null }): string | null {
  return auth.effectiveRole !== 'admin' ? auth.tenantId : null
}

export async function GET(request: NextRequest) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  const { page, limit, from, to } = parsePaging(request)
  const customerId = new URL(request.url).searchParams.get('customer_id')
  const onlyTenant = tenantScoped(auth)

  const supabase = createServiceRoleClient()
  let query = supabase.from('customer_assets')
    .select('id, customer_id, label, serial_number, status, assigned_to, location, notes, created_at', { count: 'exact' })
    .order('created_at', { ascending: false }).range(from, to)
  if (customerId) query = query.eq('customer_id', customerId)
  if (onlyTenant) query = query.eq('tenant_id', onlyTenant)

  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: 'Failed to load assets' }, { status: 500 })
  return NextResponse.json({ data, total: count ?? 0, page, limit })
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })

  const supabase = createServiceRoleClient()
  const insert: Record<string, unknown> = {
    customer_id: parsed.data.customer_id, label: parsed.data.label,
    serial_number: parsed.data.serial_number ?? null, device_id: parsed.data.device_id ?? null,
    location: parsed.data.location ?? null, assigned_to: parsed.data.assigned_to ?? null, notes: parsed.data.notes ?? null,
  }
  if (auth.tenantId) insert.tenant_id = auth.tenantId

  const { data, error } = await supabase.from('customer_assets').insert(insert)
    .select('id, label, status, created_at').single()
  if (error) {
    console.error('Failed to register asset:', error)
    return NextResponse.json({ error: 'Failed to register asset' }, { status: 500 })
  }
  return NextResponse.json({ data }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()
  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })

  const supabase = createServiceRoleClient()
  const onlyTenant = tenantScoped(auth)
  let sel = supabase.from('customer_assets').select('id, status, tenant_id').eq('id', parsed.data.id)
  if (onlyTenant) sel = sel.eq('tenant_id', onlyTenant)
  const { data: current } = await sel.maybeSingle()
  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (parsed.data.status !== undefined) {
    if (!canTransitionAsset(current.status as AssetStatus, parsed.data.status)) {
      return NextResponse.json({ error: `Cannot move an asset from ${current.status} to ${parsed.data.status}` }, { status: 400 })
    }
    update.status = parsed.data.status
  }
  if (parsed.data.assigned_to !== undefined) update.assigned_to = parsed.data.assigned_to
  if (parsed.data.location !== undefined) update.location = parsed.data.location
  if (parsed.data.notes !== undefined) update.notes = parsed.data.notes

  const { error } = await supabase.from('customer_assets').update(update).eq('id', parsed.data.id)
  if (error) return NextResponse.json({ error: 'Failed to update asset' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
