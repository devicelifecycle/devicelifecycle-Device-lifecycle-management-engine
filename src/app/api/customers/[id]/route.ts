// ============================================================================
// CUSTOMER BY ID API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { CustomerService } from '@/services/customer.service'
import { updateCustomerSchema } from '@/lib/validations'
import { isValidUUID } from '@/lib/utils'
export const dynamic = 'force-dynamic'


export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    if (!isValidUUID((await params).id)) {
      return NextResponse.json({ error: 'Invalid customer ID format' }, { status: 400 })
    }
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    const customer = await CustomerService.getCustomerById((await params).id)
    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const { role, organization_id } = profile

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
    if (effectiveRole === 'customer') {
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    // Fetch the customer for authorization check
    const customer = await CustomerService.getCustomerById((await params).id)
    if (!customer) {
      return NextResponse.json({ error: 'Customer not found' }, { status: 404 })
    }

    const { role, organization_id } = profile

    // Determine if user can update this customer
    const canUpdate =
      role === 'admin' ||
      role === 'coe_manager' ||
      role === 'sales' ||
      (effectiveRole === 'customer' && customer.organization_id === organization_id)

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
    const updatedCustomer = await CustomerService.updateCustomer((await params).id, validationResult.data)
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth

    // Only admin and coe_manager can delete customers
    if (profile.role !== 'admin' && profile.role !== 'coe_manager') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    await CustomerService.deactivateCustomer((await params).id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting customer:', error)
    return NextResponse.json(
      { error: 'Failed to delete customer' },
      { status: 500 }
    )
  }
}
