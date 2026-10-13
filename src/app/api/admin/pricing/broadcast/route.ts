// ============================================================================
// ADMIN — PRICING DISCREPANCY BROADCAST
// ============================================================================
// POST: sends a VAR-wide notification when the pricing table changes.
// Admin composes a message; it goes to every active var_entity_admin as an
// in-app notification + email. One broadcast per call, deduped by today's date
// per tenant to avoid double-sends on a retry.

import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/supabase/require-permission'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { NotificationService } from '@/services/notification.service'
import { EmailService } from '@/services/email.service'
import { resolveTenantBrandLabel } from '@/lib/tenant-brand-label'
import { PLATFORM_TENANT_ID } from '@/lib/tenant-resolve'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const schema = z.object({
  subject: z.string().min(1).max(200),
  message: z.string().min(1).max(4000),
  tenant_ids: z.array(z.string().uuid()).optional(),
})

export async function POST(request: NextRequest) {
  const guard = await requirePermission('pricing.manage')
  if ('error' in guard) return guard.error

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'Validation failed', details: parsed.error.errors }, { status: 400 })
  }

  const { subject, message, tenant_ids } = parsed.data
  const supabase = createServiceRoleClient()

  let tenantQuery = supabase
    .from('tenants')
    .select('id, name')
    .neq('id', PLATFORM_TENANT_ID)

  if (tenant_ids && tenant_ids.length > 0) {
    tenantQuery = tenantQuery.in('id', tenant_ids)
  }

  const { data: tenants } = await tenantQuery
  if (!tenants || tenants.length === 0) {
    return NextResponse.json({ error: 'No VARs found' }, { status: 404 })
  }

  const today = new Date().toISOString().split('T')[0]
  let notified = 0
  let emailed = 0

  for (const tenant of tenants) {
    const { data: admins } = await supabase
      .from('users')
      .select('id, email')
      .eq('tenant_id', tenant.id)
      .eq('role', 'var_entity_admin')
      .eq('is_active', true)

    if (!admins || admins.length === 0) continue

    const brand = await resolveTenantBrandLabel(tenant.id, supabase)

    for (const admin of admins) {
      const dedupKey = `pricing_broadcast_${today}_${tenant.id}`
      const { data: existing } = await supabase
        .from('notifications')
        .select('id')
        .eq('user_id', admin.id)
        .eq('metadata->>dedup_key', dedupKey)
        .limit(1)
        .maybeSingle()

      if (existing) continue

      await NotificationService.createNotification({
        user_id: admin.id,
        type: 'in_app',
        title: subject,
        message,
        link: '/var/orders',
        metadata: { dedup_key: dedupKey, source: 'pricing_broadcast', tenant_id: tenant.id },
      })
      notified++

      if (admin.email) {
        try {
          await EmailService.sendEmail(admin.email, `${subject} — ${brand.name}`, message, brand)
          emailed++
        } catch (err) {
          console.error(`[pricing-broadcast] email failed for ${admin.email}:`, err)
        }
      }
    }
  }

  return NextResponse.json({ ok: true, tenants: tenants.length, notified, emailed })
}
