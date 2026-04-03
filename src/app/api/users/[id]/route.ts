// ============================================================================
// USER BY ID API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { updateUserSchema } from '@/lib/validations'
import { isValidUUID } from '@/lib/utils'
export const dynamic = 'force-dynamic'


export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!isValidUUID(params.id)) {
      return NextResponse.json({ error: 'Invalid user ID format' }, { status: 400 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('*')
      .eq('id', params.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Fetch current user's profile for authorization
    const { data: currentUserProfile } = await supabase
      .from('users')
      .select('role, organization_id')
      .eq('id', user.id)
      .single()

    if (!currentUserProfile) {
      return NextResponse.json({ error: 'User profile not found' }, { status: 403 })
    }

    // Users can always view their own profile
    if (user.id === params.id) {
      return NextResponse.json(profile)
    }

    const { role, organization_id } = currentUserProfile

    // Admin and coe_manager can view all users
    if (role === 'admin' || role === 'coe_manager') {
      return NextResponse.json(profile)
    }

    // COE tech and sales can view users in their organization
    if (role === 'coe_tech' || role === 'sales') {
      if (profile.organization_id === organization_id) {
        return NextResponse.json(profile)
      }
      return NextResponse.json({ error: 'Access denied' }, { status: 403 })
    }

    // Customer and vendor can only view their own profile (already checked above)
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  } catch (error) {
    console.error('Error fetching user:', error)
    return NextResponse.json(
      { error: 'Failed to fetch user' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!isValidUUID(params.id)) {
      return NextResponse.json({ error: 'Invalid user ID format' }, { status: 400 })
    }
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check admin role
    const { data: currentProfile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    const isSelf = user.id === params.id
    if (!isSelf && currentProfile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const validationResult = updateUserSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validationResult.error.errors },
        { status: 400 }
      )
    }

    const updateData: Record<string, unknown> = {
      ...validationResult.data,
      updated_at: new Date().toISOString()
    }

    // Non-admin users cannot change their own role
    if (isSelf && currentProfile?.role !== 'admin') {
      delete updateData.role
    }

    const { data: updatedUser, error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', params.id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(updatedUser)
  } catch (error) {
    console.error('Error updating user:', error)
    return NextResponse.json(
      { error: 'Failed to update user' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    if (!isValidUUID(params.id)) {
      return NextResponse.json({ error: 'Invalid user ID format' }, { status: 400 })
    }
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check admin role
    const { data: currentProfile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    if (currentProfile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Soft delete - deactivate user
    const { error } = await supabase
      .from('users')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', params.id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deactivating user:', error)
    return NextResponse.json(
      { error: 'Failed to deactivate user' },
      { status: 500 }
    )
  }
}
