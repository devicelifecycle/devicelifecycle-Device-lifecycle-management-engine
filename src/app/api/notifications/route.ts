// ============================================================================
// NOTIFICATIONS API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAuth, unauthorized } from '@/lib/supabase/require-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'edge'

function isAdminOnlyNotification(notification: { title?: string; metadata?: Record<string, unknown> | null }): boolean {
  const metadata = notification.metadata || {}
  const audience = typeof metadata.audience === 'string' ? metadata.audience : ''
  if (audience === 'admin') return true

  const link = typeof metadata.link === 'string' ? metadata.link : ''
  if (link.startsWith('/admin')) return true

  const title = (notification.title || '').toLowerCase()
  if (title.startsWith('pricing updated')) return true

  return false
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth()
    if (!auth) return unauthorized()

    const { supabase, authUser, profile } = auth

    const { data: notifications, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', authUser.id)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error

    const visibleNotifications = (notifications || []).filter((n) => {
      if (profile?.role === 'admin') return true
      return !isAdminOnlyNotification(n as { title?: string; metadata?: Record<string, unknown> | null })
    })

    const unreadCount = visibleNotifications.filter(n => !n.is_read).length

    return NextResponse.json({
      data: visibleNotifications,
      unreadCount,
    })
  } catch (error) {
    console.error('Error fetching notifications:', error)
    return NextResponse.json(
      { error: 'Failed to fetch notifications' },
      { status: 500 }
    )
  }
}
