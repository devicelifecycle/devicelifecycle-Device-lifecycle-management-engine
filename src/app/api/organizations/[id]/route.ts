// ============================================================================
// ORGANIZATION BY ID API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { OrganizationService } from '@/services/organization.service'
import { updateOrganizationSchema } from '@/lib/validations'
export const dynamic = 'force-dynamic'


export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    // Restrict external users to their own organization
    if (['customer', 'vendor'].includes(profile.role)) {
      if (profile.organization_id !== (await params).id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const organization = await OrganizationService.getOrganizationById((await params).id)
    if (!organization) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    return NextResponse.json(organization)
  } catch (error) {
    console.error('Error fetching organization:', error)
    return NextResponse.json(
      { error: 'Failed to fetch organization' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    const { error } = await supabase
      .from('organizations')
      .delete()
      .eq('id', (await params).id)

    if (error) {
      console.error('Error deleting organization:', error)
      return NextResponse.json(
        { error: error.message || 'Failed to delete organization' },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Error deleting organization:', error)
    return NextResponse.json(
      { error: 'Failed to delete organization' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    // Check admin role
    const body = await request.json()
    const validationResult = updateOrganizationSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.errors },
        { status: 400 }
      )
    }

    // Transform validation output to match service expectations
    const { address, city, state, zip_code, country, phone, email, website, ...rest } = validationResult.data
    const updateData: any = { ...rest }

    // Bundle address fields if any are provided
    if (address !== undefined || city !== undefined || state !== undefined || zip_code !== undefined || country !== undefined) {
      updateData.address = {
        street: address,
        city,
        state,
        zip_code,
        country
      }
    }

    // Map validation fields to service fields
    if (email !== undefined) updateData.contact_email = email
    if (phone !== undefined) updateData.contact_phone = phone

    const organization = await OrganizationService.updateOrganization((await params).id, updateData)
    return NextResponse.json(organization)
  } catch (error) {
    console.error('Error updating organization:', error)
    return NextResponse.json(
      { error: 'Failed to update organization' },
      { status: 500 }
    )
  }
}
