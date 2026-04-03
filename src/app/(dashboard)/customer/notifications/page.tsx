'use client'

// ============================================================================
// CUSTOMER NOTIFICATIONS PAGE
// Shows order updates, triage exceptions, and other alerts for the customer.
// Customers are notified automatically when:
//   - Their order is received / status changes
//   - A triage exception is raised for one of their devices
//   - An exception is resolved (approved or rejected)
//   - A condition mismatch is detected
// ============================================================================

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  Bell,
  CheckCheck,
  AlertTriangle,
  ShoppingCart,
  Package,
  Info,
  ArrowRight,
  Inbox,
} from 'lucide-react'
import { useNotifications } from '@/hooks/useNotifications'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Pagination } from '@/components/ui/pagination'
import { formatRelativeTime } from '@/lib/utils'
import type { Notification } from '@/types'

const PAGE_SIZE = 15

type FilterTab = 'all' | 'exceptions' | 'orders' | 'triage'

const TABS: { key: FilterTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'orders', label: 'Order Updates' },
  { key: 'exceptions', label: 'Exceptions' },
  { key: 'triage', label: 'Device Review' },
]

function matchesFilter(n: Notification, tab: FilterTab): boolean {
  if (tab === 'all') return true
  const t = (n.title || '').toLowerCase()
  const m = (n.metadata as Record<string, unknown> | null) || {}
  const event = String(m.event || '')

  if (tab === 'exceptions')
    return (
      t.includes('exception') ||
      event.includes('exception') ||
      t.includes('mismatch') ||
      event.includes('mismatch')
    )
  if (tab === 'triage')
    return t.includes('triage') || event.includes('triage') || t.includes('condition')
  if (tab === 'orders')
    return (
      t.includes('order') ||
      event.includes('order') ||
      t.includes('quote') ||
      t.includes('received') ||
      t.includes('accepted') ||
      t.includes('rejected') ||
      t.includes('shipment') ||
      t.includes('shipped')
    )
  return false
}

function getCategoryStyle(n: Notification): {
  icon: typeof Bell
  bg: string
  color: string
} {
  const t = (n.title || '').toLowerCase()
  const event = String(((n.metadata as Record<string, unknown> | null)?.event) || '')

  if (t.includes('exception') || t.includes('mismatch') || event.includes('exception'))
    return { icon: AlertTriangle, bg: 'bg-amber-500/10', color: 'text-amber-600' }
  if (t.includes('rejected'))
    return { icon: AlertTriangle, bg: 'bg-red-500/10', color: 'text-red-600' }
  if (t.includes('approved') || t.includes('accepted'))
    return { icon: Package, bg: 'bg-green-500/10', color: 'text-green-600' }
  if (t.includes('shipment') || t.includes('shipped') || t.includes('delivered'))
    return { icon: Package, bg: 'bg-purple-500/10', color: 'text-purple-600' }
  if (t.includes('order') || t.includes('quote') || t.includes('received'))
    return { icon: ShoppingCart, bg: 'bg-blue-500/10', color: 'text-blue-600' }
  if (t.includes('triage') || t.includes('condition'))
    return { icon: Info, bg: 'bg-sky-500/10', color: 'text-sky-600' }
  return { icon: Bell, bg: 'bg-muted', color: 'text-muted-foreground' }
}

export default function CustomerNotificationsPage() {
  const { notifications, unreadCount, isLoading, markAsRead, markAllAsRead } =
    useNotifications()
  const [tab, setTab] = useState<FilterTab>('all')
  const [page, setPage] = useState(1)

  const filtered = useMemo(
    () => notifications.filter((n) => matchesFilter(n, tab)),
    [notifications, tab]
  )

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const tabUnread = useMemo(() => {
    const counts: Record<FilterTab, number> = { all: 0, orders: 0, exceptions: 0, triage: 0 }
    for (const n of notifications) {
      if (n.is_read) continue
      counts.all++
      if (matchesFilter(n, 'orders')) counts.orders++
      if (matchesFilter(n, 'exceptions')) counts.exceptions++
      if (matchesFilter(n, 'triage')) counts.triage++
    }
    return counts
  }, [notifications])

  const handleTabChange = (t: FilterTab) => {
    setTab(t)
    setPage(1)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
          <p className="text-muted-foreground mt-1">
            {unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`
              : "You're all caught up!"}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" className="self-start sm:self-auto" onClick={() => markAllAsRead()}>
            <CheckCheck className="mr-2 h-4 w-4" />
            Mark All Read
          </Button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => handleTabChange(t.key)}
            className={`relative shrink-0 px-3 py-2 text-sm font-medium transition-colors sm:px-4 ${
              tab === t.key
                ? 'text-foreground border-b-2 border-primary -mb-px'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
            {tabUnread[t.key] > 0 && (
              <Badge
                variant="destructive"
                className="ml-1.5 h-4 min-w-4 px-1 text-[10px] leading-none"
              >
                {tabUnread[t.key]}
              </Badge>
            )}
          </button>
        ))}
      </div>

      {/* Notification list */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y">
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
          ) : paginated.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted/50">
                <Inbox className="h-7 w-7 text-muted-foreground/40" />
              </div>
              <p className="mt-4 text-sm font-medium">No notifications</p>
              <p className="mt-1 text-xs">
                {tab === 'all'
                  ? "We'll notify you here about order updates, exceptions, and more."
                  : `No ${TABS.find((t) => t.key === tab)?.label?.toLowerCase() || tab} notifications yet.`}
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {paginated.map((n) => {
                const { icon: Icon, bg, color } = getCategoryStyle(n)
                const meta = (n.metadata as Record<string, unknown>) || {}
                const link = typeof meta.link === 'string' ? meta.link : null

                return (
                  <div
                    key={n.id}
                    className={`flex items-start gap-3 p-4 transition-colors ${
                      !n.is_read ? 'bg-primary/[0.03]' : ''
                    }`}
                  >
                    {/* Icon */}
                    <div
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${bg}`}
                    >
                      <Icon className={`h-4 w-4 ${color}`} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p
                          className={`text-sm ${
                            !n.is_read
                              ? 'font-semibold'
                              : 'font-medium text-muted-foreground'
                          }`}
                        >
                          {n.title}
                        </p>
                        {!n.is_read && (
                          <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                        )}
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">
                        {n.message}
                      </p>
                      <p className="mt-1.5 text-xs text-muted-foreground/60">
                        {formatRelativeTime(n.created_at)}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 items-center gap-1.5">
                      {link && (
                        <Link href={link}>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs gap-1"
                            onClick={() => !n.is_read && markAsRead(n.id)}
                          >
                            <span className="hidden sm:inline">View</span>
                            <ArrowRight className="h-3 w-3" />
                          </Button>
                        </Link>
                      )}
                      {!n.is_read && (
                        <button
                          onClick={() => markAsRead(n.id)}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                          title="Mark as read"
                        >
                          <CheckCheck className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {filtered.length > PAGE_SIZE && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      )}

      {/* Help text */}
      <p className="text-xs text-muted-foreground text-center">
        You are notified automatically when your order is updated, a device needs review,
        or a condition mismatch is detected.{' '}
        <Link href="/customer/orders" className="underline underline-offset-2">
          View My Orders
        </Link>
      </p>
    </div>
  )
}
