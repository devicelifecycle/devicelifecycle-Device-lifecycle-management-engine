// ============================================================================
// SERVER-SIDE PASSWORD UPDATE — enforces policy before Supabase auth.updateUser
// ============================================================================
// Both the profile "change password" flow and the "reset password" flow call
// this route instead of calling supabase.auth.updateUser() directly from the
// browser. That closes the bypass: a user can no longer skip client-side
// validation and set a sub-minimum password via the Supabase JS client.

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const schema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters').max(128),
})

export async function POST(request: NextRequest) {
  const auth = await requireAuth()
  if (!auth) return unauthorized()

  const body = await request.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    const msg = parsed.error.errors[0]?.message ?? 'Invalid password'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const svc = createServiceRoleClient()
  const { error } = await svc.auth.admin.updateUserById(auth.authUser.id, {
    password: parsed.data.password,
  })

  if (error) {
    console.error('Server-side password update failed:', error.message)
    return NextResponse.json({ error: 'Failed to update password' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
