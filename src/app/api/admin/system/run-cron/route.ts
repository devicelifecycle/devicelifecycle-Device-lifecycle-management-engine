import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/supabase/require-permission'

export const dynamic = 'force-dynamic'

const ALLOWED_JOBS = [
  'sla-check', 'bid-expiry', 'quote-price-check', 'shipping-tracking',
  'recurring-trade-in-reminders', 'catalog-dedup-check', 'price-scraper',
  'pricing-staleness', 'pricing-training', 'sla-training', 'competitor-sync',
  'subscription-lifecycle', 'recurring-charge', 'dunning-retry', 'retention',
] as const

export async function POST(request: NextRequest) {
  const guard = await requirePermission('platform.manage')
  if ('error' in guard) return guard.error

  const { job } = await request.json()
  if (!job || !(ALLOWED_JOBS as readonly string[]).includes(job)) {
    return NextResponse.json({ message: 'Invalid job name' }, { status: 400 })
  }

  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return NextResponse.json({ message: 'CRON_SECRET not configured' }, { status: 500 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${request.headers.get('host')}`
  const url = `${baseUrl}/api/cron/${job}`

  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${cronSecret}` },
    })

    if (res.ok) {
      const data = await res.json().catch(() => ({}))
      return NextResponse.json({ message: data.message || 'Job completed successfully', data })
    }

    const errorText = await res.text().catch(() => '')
    return NextResponse.json(
      { message: `Job failed with status ${res.status}: ${errorText}` },
      { status: 502 }
    )
  } catch (err) {
    return NextResponse.json(
      { message: `Failed to reach cron endpoint: ${err instanceof Error ? err.message : 'unknown error'}` },
      { status: 502 }
    )
  }
}
