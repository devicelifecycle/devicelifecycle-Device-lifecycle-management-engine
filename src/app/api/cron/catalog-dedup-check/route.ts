// ============================================================================
// CRON: CATALOG DUPLICATE DETECTION (alert-only, never modifies data)
// ============================================================================
// Runs weekly. A real DB-level unique constraint can't safely replicate
// device-match.ts's fuzzy matching (brand-alias mapping, free-text
// storage/color stripping, Apple-specific normalization) without either
// missing real duplicates or incorrectly blocking legitimate different
// variants. This is the lower-risk alternative: periodically re-run the same
// fuzzy grouping scripts/dedupe-device-catalog.ts uses for detection only,
// and email an alert if new clusters appear, so they're caught within a
// week instead of going unnoticed indefinitely. Never writes to
// device_catalog or any other table — merging still happens manually via
// `npx tsx scripts/dedupe-device-catalog.ts --apply` after review.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { readServerEnv } from '@/lib/server-env'
import { createServiceRoleClient } from '@/lib/supabase/service-role'
import { computeDeviceIdentity } from '@/lib/device-match'
import { NotificationService } from '@/services/notification.service'
import { logCronSuccess, logCronFailure } from '@/lib/cron-logging'

export const dynamic = 'force-dynamic'
const CRON_NAME = 'catalog-dedup-check'

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(Buffer.from(a), Buffer.from(b))
}

type DeviceRow = { id: string; make: string | null; model: string | null; category: string | null }

export async function GET(request: NextRequest) {
  const startedAt = new Date()
  try {
    const cronSecret = readServerEnv('CRON_SECRET')
    if (!cronSecret) {
      console.error('CRON_SECRET not set — catalog-dedup-check cron disabled')
      return NextResponse.json({ error: 'Service unavailable' }, { status: 503 })
    }
    const authHeader = request.headers.get('authorization') || ''
    if (!safeCompare(authHeader, `Bearer ${cronSecret}`)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = createServiceRoleClient()

    // Paginated fetch — device_catalog can exceed Supabase's default 1000-row cap.
    const devices: DeviceRow[] = []
    const pageSize = 1000
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from('device_catalog')
        .select('id, make, model, category')
        .eq('is_active', true)
        .range(from, from + pageSize - 1)
      if (error) throw error
      devices.push(...((data || []) as DeviceRow[]))
      if (!data || data.length < pageSize) break
    }

    const groups = new Map<string, DeviceRow[]>()
    for (const device of devices) {
      const { key } = computeDeviceIdentity(device.make, device.model, device.category)
      const list = groups.get(key) || []
      list.push(device)
      groups.set(key, list)
    }

    const duplicateClusters = [...groups.entries()].filter(([, rows]) => rows.length > 1)
    const duplicateRowCount = duplicateClusters.reduce((sum, [, rows]) => sum + rows.length - 1, 0)

    if (duplicateClusters.length > 0) {
      const preview = duplicateClusters.slice(0, 5).map(([key, rows]) => `${key} (${rows.length} rows)`).join('; ')
      const { data: admins } = await supabase
        .from('users')
        .select('id')
        .eq('role', 'admin')
        .eq('is_active', true)

      await Promise.all((admins || []).map((admin) =>
        NotificationService.createNotification({
          user_id: admin.id,
          type: 'in_app',
          title: `Catalog duplicates found — ${duplicateClusters.length} cluster(s)`,
          message: `Weekly catalog check found ${duplicateClusters.length} duplicate cluster(s) (${duplicateRowCount} rows would be merged): ${preview}. Review with "npx tsx scripts/dedupe-device-catalog.ts" then merge with --apply.`,
          link: '/devices',
          metadata: { type: 'catalog_dedup_alert', cluster_count: duplicateClusters.length },
        }).catch(() => {})
      ))
    }

    await logCronSuccess(CRON_NAME, startedAt, {
      scanned: devices.length,
      duplicate_clusters: duplicateClusters.length,
      duplicate_rows: duplicateRowCount,
    })

    return NextResponse.json({
      success: true,
      scanned: devices.length,
      duplicate_clusters: duplicateClusters.length,
      duplicate_rows: duplicateRowCount,
    })
  } catch (error) {
    console.error('[catalog-dedup-check] Error:', error)
    await logCronFailure(CRON_NAME, startedAt, error)
    return NextResponse.json({ error: 'Failed to run catalog dedup check' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
