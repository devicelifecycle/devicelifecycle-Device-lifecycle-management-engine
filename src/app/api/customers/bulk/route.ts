// ============================================================================
// VAR CUSTOMER BULK IMPORT — batch-create customer records
// ============================================================================
// Console import for a VAR Entity Admin (or platform admin / COE manager).
// Validates each row, skips emails that already exist in the tenant, enforces
// the tenant's customer quota for the batch, and inserts in chunks. Tenant RLS
// scopes + validates every write; VAR rows are stamped with the VAR's tenant so
// they satisfy the RLS WITH CHECK. Records only — portal logins are provisioned
// separately, so a large import stays fast.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { CustomerService } from '@/services/customer.service'
import { customerSchema } from '@/lib/validations'
import { tenantLimits } from '@/lib/tenant-limits'
import { quotaBlockMessage } from '@/lib/quota'
import { nonPlatformTenantId } from '@/lib/tenant-resolve'
import { delegationLevel } from '@/lib/delegation'
import { z } from 'zod'
export const dynamic = 'force-dynamic'

const importRow = customerSchema.extend({ region: z.string().max(80).optional() })
const bulkSchema = z.object({ customers: z.array(importRow).min(1).max(1000) })

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, profile, effectiveRole } = auth

    // Platform admin / COE manager, or a VAR Entity Admin (whole-tenant scope).
    const canImport = profile.role === 'admin' || profile.role === 'coe_manager'
      || delegationLevel(effectiveRole) === 'tenant'
    if (!canImport) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

    const parsed = bulkSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
    }
    const rows = parsed.data.customers

    // Skip rows whose email already exists in the tenant (RLS scopes this read).
    const emails = rows.map((r) => r.contact_email.toLowerCase())
    const { data: existing } = await supabase
      .from('customers').select('contact_email').in('contact_email', emails)
    const taken = new Set((existing ?? []).map((e: { contact_email: string }) => e.contact_email.toLowerCase()))

    // De-dupe within the payload too, keeping the first occurrence of each email.
    const seen = new Set<string>()
    const fresh = rows.filter((r) => {
      const key = r.contact_email.toLowerCase()
      if (taken.has(key) || seen.has(key)) return false
      seen.add(key)
      return true
    })
    const skipped = rows.length - fresh.length

    if (fresh.length === 0) {
      return NextResponse.json({ created: 0, skipped, message: 'All rows already exist' })
    }

    // Per-tenant customer quota for the whole batch (no-op for platform/unlimited).
    if (auth.tenantId) {
      try {
        const { data: tenant } = await supabase.from('tenants').select('settings').eq('id', auth.tenantId).maybeSingle()
        const { license } = tenantLimits(tenant?.settings)
        if (license.customers >= 0) {
          const { count } = await supabase.from('customers').select('id', { count: 'exact', head: true }).eq('tenant_id', auth.tenantId)
          const blocked = quotaBlockMessage(license.customers, count ?? 0, fresh.length, 'Customers')
          if (blocked) return NextResponse.json({ error: blocked }, { status: 403 })
        }
      } catch { /* fail open — never block an import on a quota lookup error */ }
    }

    const orgId = profile.organization_id ?? undefined
    const payload = fresh.map((r) => ({ ...r, organization_id: r.organization_id ?? orgId }))
    const created = await CustomerService.bulkCreateCustomers(payload, {
      tenantId: nonPlatformTenantId(auth.tenantId),
    })

    return NextResponse.json({ created: created.length, skipped })
  } catch (error) {
    console.error('Customer bulk import failed:', error)
    return NextResponse.json({ error: 'Failed to import customers' }, { status: 500 })
  }
}
