// ============================================================================
// CUSTOMERS API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { CustomerService } from '@/services/customer.service'
import { customerSchema } from '@/lib/validations'

export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role, organization_id')
      .eq('id', user.id)
      .single()

    if (!profile || ['customer', 'vendor'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const filters = {
      search: searchParams.get('search') || undefined,
      is_active: searchParams.get('is_active') === 'true' ? true :
                 searchParams.get('is_active') === 'false' ? false : undefined,
      organization_id: profile.organization_id,
      page: Math.min(Math.max(parseInt(searchParams.get('page') || '1'), 1), 10000),
      page_size: Math.min(Math.max(parseInt(searchParams.get('page_size') || searchParams.get('limit') || '20'), 1), 100),
    }

    const result = await CustomerService.getCustomers(filters)
    return NextResponse.json(result)
  } catch (error) {
    console.error('Error fetching customers:', error)
    return NextResponse.json(
      { error: 'Failed to fetch customers' },
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

    // Get user's profile — only internal roles can create customers
    const { data: userData } = await supabase
      .from('users')
      .select('role, organization_id')
      .eq('id', user.id)
      .single()

    if (userData && ['customer', 'vendor'].includes(userData.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    
    // Validate input
    const validationResult = customerSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.errors },
        { status: 400 }
      )
    }

    const orgId = userData?.organization_id
    if (!orgId) {
      return NextResponse.json(
        { error: 'User organization is required to create customers' },
        { status: 400 }
      )
    }
    const customer = await CustomerService.createCustomer(validationResult.data, orgId)
    return NextResponse.json(customer, { status: 201 })
  } catch (error) {
    console.error('Error creating customer:', error)
    return NextResponse.json(
      { error: 'Failed to create customer' },
      { status: 500 }
    )
  }
}
