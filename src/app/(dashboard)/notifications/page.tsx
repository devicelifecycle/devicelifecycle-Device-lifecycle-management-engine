// ============================================================================
// NOTIFICATIONS PAGE
// ============================================================================

'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, CheckCheck, AlertTriangle, ShoppingCart, Package } from 'lucide-react'
import { useNotifications } from '@/hooks/useNotifications'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Pagination } from '@/components/ui/pagination'
import { formatRelativeTime } from '@/lib/utils'
import type { Notification } from '@/types'

const PAGE_SIZE = 20

// Infer icon category from notification title
const getCategoryIcon = (title: string): { icon: typeof Bell; bg: string; color: string } => {
  const t = title.toLowerCase()
  if (t.includes('breach')) return { icon: AlertTriangle, bg: 'bg-red-500/10', color: 'text-red-600' }
  if (t.includes('sla') || t.includes('warning')) return { icon: AlertTriangle, bg: 'bg-amber-500/10', color: 'text-amber-600' }
  if (t.includes('shipment') || t.includes('shipping')) return { icon: Package, bg: 'bg-purple-500/10', color: 'text-purple-600' }
  if (t.includes('order')) return { icon: ShoppingCart, bg: 'bg-blue-500/10', color: 'text-blue-600' }
  return { icon: Bell, bg: 'bg-muted', color: 'text-muted-foreground' }
}

export default function NotificationsPage() {
  const { notifications, unreadCount, isLoading, markAsRead, markAllAsRead } = useNotifications()
  const router = useRouter()
  const [page, setPage] = useState(1)

  const totalPages = Math.max(1, Math.ceil(notifications.length / PAGE_SIZE))
  const paginated = notifications.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground mt-1">
            {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount > 1 ? 's' : ''}` : 'All caught up!'}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={() => markAllAsRead()}>
            <CheckCheck className="mr-2 h-4 w-4" />Mark All Read
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-0 divide-y">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="p-4">
                  <div className="flex gap-3">
                    <div className="h-9 w-9 rounded-lg bg-muted/50 animate-pulse shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 w-3/4 rounded bg-muted/50 animate-pulse" />
                      <div className="h-3 w-1/2 rounded bg-muted/50 animate-pulse" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted/50">
                <Bell className="h-7 w-7 text-muted-foreground/40" />
              </div>
              <p className="mt-4 text-sm font-medium">No notifications yet</p>
              <p className="mt-1 text-xs">You&apos;ll be notified about important updates here.</p>
            </div>
          ) : (
            <div className="divide-y">
              {paginated.map(n => {
                const typeConfig = getCategoryIcon(n.title)
                const IconComponent = typeConfig.icon
                const meta = (n.metadata as Record<string, unknown>) || {}
                const link = typeof meta.link === 'string' ? meta.link : null
                const handleClick = () => {
                  if (!n.is_read) markAsRead(n.id)
                  if (link) router.push(link)
                }
                return (
                  <button
                    key={n.id}
                    className={`w-full text-left px-4 py-3.5 transition-all hover:bg-muted/50 ${!n.is_read ? 'bg-primary/[0.03]' : ''} ${link ? 'cursor-pointer' : ''}`}
                    onClick={handleClick}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${typeConfig.bg}`}>
                        <IconComponent className={`h-4 w-4 ${typeConfig.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm ${!n.is_read ? 'font-semibold' : 'font-medium text-muted-foreground'}`}>{n.title}</p>
                          {!n.is_read && <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />}
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                        <p className="text-xs text-muted-foreground/70 mt-1.5">{formatRelativeTime(n.created_at)}</p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
      {notifications.length > PAGE_SIZE && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      )}
    </div>
  )
}
