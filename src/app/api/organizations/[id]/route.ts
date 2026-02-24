// ============================================================================
// ORGANIZATION BY ID API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { OrganizationService } from '@/services/organization.service'
import { updateOrganizationSchema } from '@/lib/validations'

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Restrict external users to their own organization
    const { data: profile } = await supabase
      .from('users')
      .select('role, organization_id')
      .eq('id', user.id)
      .single()

    if (profile && ['customer', 'vendor'].includes(profile.role)) {
      if (profile.organization_id !== params.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const organization = await OrganizationService.getOrganizationById(params.id)
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check admin role
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

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

    const organization = await OrganizationService.updateOrganization(params.id, updateData)
    return NextResponse.json(organization)
  } catch (error) {
    console.error('Error updating organization:', error)
    return NextResponse.json(
      { error: 'Failed to update organization' },
      { status: 500 }
    )
  }
}
