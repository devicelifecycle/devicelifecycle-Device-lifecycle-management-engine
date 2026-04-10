'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, ChevronRight, Menu, Moon, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { useNotifications } from '@/hooks/useNotifications'
import { useAuth } from '@/hooks/useAuth'
import { snakeToTitle } from '@/lib/utils'

export function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const pathname = usePathname()
  const { unreadCount } = useNotifications()
  const { user } = useAuth()
  const { resolvedTheme, setTheme } = useTheme()
  const notificationsHref = user?.role === 'customer' ? '/customer/notifications' : '/notifications'

  const segments = pathname.split('/').filter(Boolean)
  const breadcrumbs = segments.map((segment, index) => {
    const href = '/' + segments.slice(0, index + 1).join('/')
    const isLast = index === segments.length - 1
    const isId = /^[0-9a-f-]{36}$/i.test(segment)
    return {
      href,
      isLast,
      label: isId ? 'Details' : snakeToTitle(segment.replace(/-/g, '_')),
    }
  })

  return (
    <header className="topbar-surface sticky top-0 z-40 px-4 py-3 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
        {/* Left: breadcrumbs */}
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="outline" size="icon" className="lg:hidden h-8 w-8" onClick={onMenuClick}>
            <Menu className="h-4 w-4" />
          </Button>

          <motion.nav
            key={pathname}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex min-w-0 items-center gap-1 text-sm"
          >
            <Link href="/dashboard" className="text-stone-500 hover:text-stone-300 transition-colors">
              Home
            </Link>
            {breadcrumbs.map((crumb) => (
              <span key={crumb.href} className="flex min-w-0 items-center gap-1">
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-stone-700" />
                {crumb.isLast ? (
                  <span className="truncate font-medium text-stone-200">{crumb.label}</span>
                ) : (
                  <Link href={crumb.href} className="truncate text-stone-500 hover:text-stone-300 transition-colors">
                    {crumb.label}
                  </Link>
                )}
              </span>
            ))}
          </motion.nav>
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-stone-500 hover:text-stone-200"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={resolvedTheme ?? 'light'}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15 }}
              >
                {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </motion.span>
            </AnimatePresence>
          </Button>

          <Link href={notificationsHref}>
            <Button variant="ghost" size="icon" className="relative h-8 w-8 text-stone-500 hover:text-stone-200">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
          </Link>

          <Link href="/profile">
            <div className="ml-1 flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-[11px] font-bold text-primary hover:bg-primary/25 transition-colors">
              {user?.full_name?.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase() || 'U'}
            </div>
          </Link>
        </div>
      </div>
    </header>
  )
}
