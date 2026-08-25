// ============================================================================
// VAR CUSTOMER MANAGEMENT — suspend / reactivate / assign / move / assign plan
// ============================================================================
// Console actions for a VAR Entity Admin (whole tenant) or Regional Manager
// (their region only). Tenant isolation is enforced by RLS on the authenticated
// client; this route adds the delegated-scope authorization on top and a
// whitelisted action set. Platform admins can act on any tenant.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { CustomerService } from '@/services/customer.service'
import { canManageCustomer } from '@/lib/delegation'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

const manageSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('suspend') }),
  z.object({ action: z.literal('reactivate') }),
  z.object({ action: z.literal('assign'), repId: z.string().uuid().nullable() }),
  z.object({ action: z.literal('move'), region: z.string().min(1).max(80).nullable() }),
  z.object({ action: z.literal('assign_plan'), planId: z.string().uuid().nullable() }),
])

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, profile, effectiveRole } = auth
    const { id } = await params

    // RLS scopes this read to the actor's tenant → null means not found OR not
    // in their tenant; either way the actor may not act on it.
    const customer = await CustomerService.getCustomerById(id)
    if (!customer) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

    const customerRegion = (customer as { region?: string | null }).region ?? null
    if (!canManageCustomer(profile.role, effectiveRole, profile.region, customerRegion)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const parsed = manageSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
    }
    const a = parsed.data

    // A Regional Manager moving a customer to a different region would move it out
    // of their own scope; only Entity Admins / platform admins may re-region freely.
    if (a.action === 'move' && a.region !== customerRegion) {
      if (!canManageCustomer(profile.role, effectiveRole, profile.region, a.region)) {
        return NextResponse.json({ error: 'Cannot move a customer outside your scope' }, { status: 403 })
      }
    }

    // An assignment must reference a real catalog row; null clears the override
    // so the customer inherits the VAR tenant plan again.
    if (a.action === 'assign_plan' && a.planId) {
      const { data: plan } = await supabase.from('subscription_plans').select('id').eq('id', a.planId).maybeSingle()
      if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 400 })
    }

    const fields =
      a.action === 'suspend' ? { is_active: false }
      : a.action === 'reactivate' ? { is_active: true }
      : a.action === 'assign' ? { assigned_rep_id: a.repId }
      : a.action === 'assign_plan' ? { plan_id: a.planId }
      : { region: a.region }

    const updated = await CustomerService.setManagedFields(id, fields)
    return NextResponse.json({ data: updated })
  } catch (error) {
    console.error('Customer management action failed:', error)
    return NextResponse.json({ error: 'Failed to update customer' }, { status: 500 })
  }
}
