// ============================================================================
// CUSTOMER BY ID API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { CustomerService } from '@/services/customer.service'
import { updateCustomerSchema } from '@/lib/validations'
import { isValidUUID } from '@/lib/utils'
export const dynamic = 'force-dynamic'


export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!isValidUUID(params.id)) {
      return NextResponse.json({ error: 'Invalid customer ID format' }, { status: 400 })
    }
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const customer = await CustomerService.getCustomerById(params.id)
    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    // Fetch current user's profile for authorization
    const { data: userProfile } = await supabase
      .from('users')
      .select('role, organization_id')
      .eq('id', user.id)
      .single()

    if (!userProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 403 })
    }

    const { role, organization_id } = userProfile

    // Internal roles and sales can view all customers
    if (role === 'admin' || role === 'coe_manager' || role === 'coe_tech' || role === 'sales') {
      let organization = null
      if (customer.organization_id) {
        const { data: org } = await supabase.from('organizations').select('id, name, type').eq('id', customer.organization_id).single()
        organization = org
      }
      return NextResponse.json({ ...customer, organization })
    }

    // Customer can only view their own customer record
    if (role === 'customer') {
      if (customer.organization_id === organization_id) {
        let organization = null
        if (customer.organization_id) {
          const { data: org } = await supabase.from('organizations').select('id, name, type').eq('id', customer.organization_id).single()
          organization = org
        }
        return NextResponse.json({ ...customer, organization })
      }
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Vendor cannot view customers
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  } catch (error) {
    console.error('Error fetching customer:', error)
    return NextResponse.json(
      { error: 'Failed to fetch customer' },
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

    // Fetch current user's profile for authorization
    const { data: userProfile } = await supabase
      .from('users')
      .select('role, organization_id')
      .eq('id', user.id)
      .single()

    if (!userProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 403 })
    }

    // Fetch the customer for authorization check
    const customer = await CustomerService.getCustomerById(params.id)
    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const { role, organization_id } = userProfile

    // Determine if user can update this customer
    const canUpdate =
      role === 'admin' ||
      role === 'coe_manager' ||
      role === 'sales' ||
      (role === 'customer' && customer.organization_id === organization_id)

    if (!canUpdate) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    const body = await request.json()
    const validationResult = updateCustomerSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.errors },
        { status: 400 }
      )
    }
    const updatedCustomer = await CustomerService.updateCustomer(params.id, validationResult.data)
    return NextResponse.json(updatedCustomer)
  } catch (error) {
    console.error('Error updating customer:', error)
    return NextResponse.json(
      { error: 'Failed to update customer' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch current user's profile for authorization
    const { data: userProfile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!userProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 403 })
    }

    // Only admin and coe_manager can delete customers
    if (userProfile.role !== 'admin' && userProfile.role !== 'coe_manager') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    await CustomerService.deactivateCustomer(params.id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting customer:', error)
    return NextResponse.json(
      { error: 'Failed to delete customer' },
      { status: 500 }
    )
  }
}
