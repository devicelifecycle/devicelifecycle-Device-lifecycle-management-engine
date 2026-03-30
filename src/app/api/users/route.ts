// ============================================================================
// USERS API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createUserSchema } from '@/lib/validations'
import { UserProvisioningService } from '@/services/user-provisioning.service'
export const dynamic = 'force-dynamic'


export async function GET(request: NextRequest) {
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

    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ data: users || [] })
  } catch (error) {
    console.error('Error fetching users:', error)
    return NextResponse.json(
      { error: 'Failed to fetch users' },
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

    // Validate input with Zod (enforces valid role enum, email format, etc.)
    const validationResult = createUserSchema.safeParse(body)
    if (!validationResult.success) {
      const first = validationResult.error.errors[0]
      const message = first?.message ?? 'Validation failed'
      return NextResponse.json({ error: message }, { status: 400 })
    }

    const { full_name, email, role, password, organization_id, notification_email, phone } = validationResult.data

    const provisioned = await UserProvisioningService.provisionUser({
      fullName: full_name,
      email,
      role,
      password,
      organizationId: organization_id,
      notificationEmail: notification_email,
      phone,
    })

    return NextResponse.json(provisioned.user, { status: 201 })
  } catch (error) {
    console.error('Error creating user:', error)
    const message = error instanceof Error ? error.message : 'Failed to create user'
    return NextResponse.json(
      { error: message },
      { status: message.includes('exists') || message.includes('required') ? 400 : 500 }
    )
  }
}
