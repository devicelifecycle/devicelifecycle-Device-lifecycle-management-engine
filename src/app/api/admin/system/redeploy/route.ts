import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/supabase/require-permission'

export const dynamic = 'force-dynamic'

export async function POST() {
  const guard = await requirePermission('platform.manage')
  if ('error' in guard) return guard.error

  const hookUrl = process.env.VERCEL_DEPLOY_HOOK
  if (!hookUrl) {
    return NextResponse.json(
      { message: 'VERCEL_DEPLOY_HOOK not configured — add it to environment variables' },
      { status: 500 }
    )
  }

  try {
    const res = await fetch(hookUrl, { method: 'POST' })
    if (res.ok) {
      return NextResponse.json({ message: 'Redeploy triggered successfully' })
    }
    return NextResponse.json(
      { message: `Vercel returned ${res.status}` },
      { status: 502 }
    )
  } catch (err) {
    return NextResponse.json(
      { message: `Failed to trigger redeploy: ${err instanceof Error ? err.message : 'unknown'}` },
      { status: 502 }
    )
  }
}
