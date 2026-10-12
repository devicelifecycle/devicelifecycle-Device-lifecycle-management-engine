import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/supabase/require-permission'
import { revalidatePath } from 'next/cache'

export const dynamic = 'force-dynamic'

export async function POST() {
  const guard = await requirePermission('platform.manage')
  if ('error' in guard) return guard.error

  revalidatePath('/', 'layout')

  return NextResponse.json({ message: 'Cache cleared successfully' })
}
