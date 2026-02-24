// ============================================================================
// ORGANIZATIONS API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { OrganizationService } from '@/services/organization.service'
import { createOrganizationSchema } from '@/lib/validations'
import type { OrganizationType } from '@/types'

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user role and org for access control
    const { data: profile } = await supabase
      .from('users')
      .select('role, organization_id')
      .eq('id', user.id)
      .single()

    // Customer/vendor can only see their own organization
    if (profile && ['customer', 'vendor'].includes(profile.role)) {
      if (!profile.organization_id) {
        return NextResponse.json({ data: [], total: 0, page: 1, page_size: 20, total_pages: 0 })
      }
      const org = await OrganizationService.getOrganizationById(profile.organization_id)
      return NextResponse.json({ data: org ? [org] : [], total: org ? 1 : 0, page: 1, page_size: 20, total_pages: org ? 1 : 0 })
    }

    const searchParams = request.nextUrl.searchParams
    const filters = {
      search: searchParams.get('search') || undefined,
      type: (searchParams.get('type') as OrganizationType) || undefined,
      page: Math.min(Math.max(parseInt(searchParams.get('page') || '1'), 1), 10000),
      page_size: Math.min(Math.max(parseInt(searchParams.get('page_size') || searchParams.get('limit') || '20'), 1), 100),
    }

    const result = await OrganizationService.getOrganizations(filters)
    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching organizations:', error)
    return NextResponse.json(
      { error: 'Failed to fetch organizations' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
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

    // Validate input
    const validationResult = createOrganizationSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.errors },
        { status: 400 }
      )
    }

    const { address, city, state, zip_code, country, phone, email, website, ...rest } = validationResult.data

    const organization = await OrganizationService.createOrganization({
      ...rest,
      address: { street: address, city, state, zip_code, country },
      contact_email: email,
      contact_phone: phone,
    })

    return NextResponse.json(organization, { status: 201 })
  } catch (error) {
    console.error('Error creating organization:', error)
    return NextResponse.json(
      { error: 'Failed to create organization' },
      { status: 500 }
    )
  }
}
