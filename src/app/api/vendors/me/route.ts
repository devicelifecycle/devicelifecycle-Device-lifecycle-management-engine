// ============================================================================
// MY VENDOR API ROUTE
// Returns/updates the vendor record for the logged-in user's organization.
// Accessible to users whose effective role is 'vendor' (primary or secondary).
// Mirrors src/app/api/customers/me/route.ts.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { ensureVendorProfileForOrganization } from '@/lib/vendor-profile'
import { vendorSelfServiceSchema } from '@/lib/validations'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()

    const { effectiveRole, profile, supabase } = auth

    if (effectiveRole !== 'vendor') {
      return NextResponse.json({ error: 'Forbidden — vendor role required' }, { status: 403 })
    }

    if (!profile.organization_id) {
      return NextResponse.json(
        { error: 'No organization associated with this account' },
        { status: 400 }
      )
    }

    const { data: userDetails } = await supabase
      .from('users')
      .select('full_name, email, notification_email, phone')
      .eq('id', profile.id)
      .single()

    const serviceRole = createServiceRoleClient()
    const vendor = await ensureVendorProfileForOrganization(
      serviceRole,
      profile.organization_id,
      userDetails ?? {},
    )

    return NextResponse.json(vendor)
  } catch (error) {
    console.error('Error fetching my vendor:', error)
    return NextResponse.json(
      { error: 'Failed to fetch vendor' },
      { status: 500 }
    )
  }
}

/**
 * Lets the org's designated org admin (users.is_org_admin) edit their own
 * company's contact/address details — payment_terms, notes, and is_active
 * stay admin-only. `vendors_update` RLS is internal-only (`is_internal_user()`),
 * so this write goes through the service-role client with the org match as
 * the real authorization gate, same pattern as customers/me PATCH.
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { effectiveRole, profile } = auth

    if (effectiveRole !== 'vendor') {
      return NextResponse.json({ error: 'Forbidden — vendor role required' }, { status: 403 })
    }
    if (!profile.is_org_admin) {
      return NextResponse.json({ error: 'Only your organization admin can edit company details' }, { status: 403 })
    }
    if (!profile.organization_id) {
      return NextResponse.json({ error: 'No organization associated with this account' }, { status: 400 })
    }

    const body = await request.json()
    const validationResult = vendorSelfServiceSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.errors },
        { status: 400 }
      )
    }

    const serviceRole = createServiceRoleClient()
    const vendor = await ensureVendorProfileForOrganization(serviceRole, profile.organization_id, {})

    const { data: updated, error } = await serviceRole
      .from('vendors')
      .update({ ...validationResult.data, updated_at: new Date().toISOString() })
      .eq('id', vendor.id)
      .eq('organization_id', profile.organization_id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating my vendor:', error)
    return NextResponse.json(
      { error: 'Failed to update vendor' },
      { status: 500 }
    )
  }
}
