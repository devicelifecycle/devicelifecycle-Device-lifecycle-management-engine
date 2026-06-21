// ============================================================================
// MY RECURRING TRADE-IN SCHEDULE — self-service, org-admin only
// Mirrors customers/me: reminder-only (see migration 20260623000000), never
// auto-creates an order.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'
import { RecurringTradeInService, type RecurringFrequency } from '@/services/recurring-trade-in.service'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const FREQUENCIES: RecurringFrequency[] = ['monthly', 'quarterly', 'semi_annually', 'annually']
const setScheduleSchema = z.object({ frequency: z.enum(FREQUENCIES as [string, ...string[]]) })

export async function GET() {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { effectiveRole, profile } = auth

    if (effectiveRole !== 'customer') {
      return NextResponse.json({ error: 'Forbidden — customer role required' }, { status: 403 })
    }
    if (!profile.organization_id) {
      return NextResponse.json(null)
    }

    const schedule = await RecurringTradeInService.getScheduleForOrganization(profile.organization_id)
    return NextResponse.json(schedule)
  } catch (error) {
    console.error('Error fetching recurring schedule:', error)
    return NextResponse.json({ error: 'Failed to fetch recurring schedule' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { authUser, effectiveRole, profile } = auth

    if (effectiveRole !== 'customer') {
      return NextResponse.json({ error: 'Forbidden — customer role required' }, { status: 403 })
    }
    if (!profile.is_org_admin) {
      return NextResponse.json({ error: 'Only your organization admin can set this' }, { status: 403 })
    }
    if (!profile.organization_id) {
      return NextResponse.json({ error: 'No organization associated with this account' }, { status: 400 })
    }

    const body = await request.json()
    const validationResult = setScheduleSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json({ error: 'Validation failed', details: validationResult.error.errors }, { status: 400 })
    }

    const schedule = await RecurringTradeInService.setSchedule(
      profile.organization_id,
      validationResult.data.frequency as RecurringFrequency,
      authUser.id
    )
    return NextResponse.json(schedule)
  } catch (error) {
    console.error('Error setting recurring schedule:', error)
    return NextResponse.json({ error: 'Failed to set recurring schedule' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()
    const { effectiveRole, profile } = auth

    if (effectiveRole !== 'customer') {
      return NextResponse.json({ error: 'Forbidden — customer role required' }, { status: 403 })
    }
    if (!profile.is_org_admin) {
      return NextResponse.json({ error: 'Only your organization admin can turn this off' }, { status: 403 })
    }
    if (!profile.organization_id) {
      return NextResponse.json({ error: 'No organization associated with this account' }, { status: 400 })
    }

    await RecurringTradeInService.deactivateSchedule(profile.organization_id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deactivating recurring schedule:', error)
    return NextResponse.json({ error: 'Failed to deactivate recurring schedule' }, { status: 500 })
  }
}
