// ============================================================================
// NOTIFICATIONS API ROUTE
// ============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

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
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', user.id)
      .single()

    const { data: notifications, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
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
