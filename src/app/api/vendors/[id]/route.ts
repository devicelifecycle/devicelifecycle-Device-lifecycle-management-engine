// ============================================================================
// VENDOR BY ID API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { VendorService } from '@/services/vendor.service'
import { vendorSchema } from '@/lib/validations'
import { isValidUUID } from '@/lib/utils'
export const dynamic = 'force-dynamic'


export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { supabase, authUser, profile, effectiveRole } = auth
    if (!isValidUUID((await params).id)) {
      return NextResponse.json({ error: 'Invalid vendor ID format' }, { status: 400 })
    }

    if (['customer'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (profile.role === 'vendor' && profile.organization_id) {
      const vendor = await VendorService.getVendorById((await params).id)
      if (!vendor || vendor.organization_id !== profile.organization_id) {
        return NextResponse.json({ error: 'Forbidden — you can only view your own vendor profile' }, { status: 403 })
      }
      return NextResponse.json(vendor)
    }

    const vendor = await VendorService.getVendorById((await params).id)
    if (!vendor) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 })
    }

    return NextResponse.json(vendor)
  } catch (error) {
    console.error('Error fetching vendor:', error)
    return NextResponse.json(
      { error: 'Failed to fetch vendor' },
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

    if (!['admin', 'coe_manager', 'sales'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden — admin, COE manager, or sales role required' }, { status: 403 })
    }

    const body = await request.json()

    // Validate input
    const validationResult = vendorSchema.partial().safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.errors },
        { status: 400 }
      )
    }

    const vendor = await VendorService.updateVendor((await params).id, validationResult.data)
    return NextResponse.json(vendor)
  } catch (error) {
    console.error('Error updating vendor:', error)
    return NextResponse.json(
      { error: 'Failed to update vendor' },
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

    if (!['admin', 'coe_manager'].includes(profile.role)) {
      return NextResponse.json({ error: 'Forbidden — admin or COE manager role required' }, { status: 403 })
    }

    await VendorService.deleteVendor((await params).id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting vendor:', error)
    return NextResponse.json(
      { error: 'Failed to delete vendor' },
      { status: 500 }
    )
  }
}
