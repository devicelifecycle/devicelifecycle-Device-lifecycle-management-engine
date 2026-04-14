'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, ChevronRight, Menu, Moon, PanelLeftClose, PanelLeftOpen, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useNotifications } from '@/hooks/useNotifications'
import { useAuth } from '@/hooks/useAuth'
import { snakeToTitle } from '@/lib/utils'

interface HeaderProps {
  /** Desktop: toggle the collapsible sidebar open/closed */
  onToggleSidebar?: () => void
  sidebarOpen?: boolean
  /** Mobile: open the mobile drawer */
  onMobileMenuClick?: () => void
  /** Legacy compat — same as onMobileMenuClick */
  onMenuClick?: () => void
}

export function Header({ onToggleSidebar, sidebarOpen = true, onMobileMenuClick, onMenuClick }: HeaderProps) {
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

  const initials = user?.full_name?.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase() || 'U'

  return (
    <header className="topbar-surface sticky top-0 z-40 px-4 py-2.5 sm:px-5 lg:px-6">
      <div className="flex items-center justify-between gap-4">

        {/* Left: toggle + breadcrumb */}
        <div className="flex min-w-0 items-center gap-2">

          {/* Desktop toggle — slides sidebar in/out */}
          <button
            onClick={onToggleSidebar}
            className="hidden lg:flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={sidebarOpen ? 'close' : 'open'}
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                transition={{ duration: 0.15 }}
              >
                {sidebarOpen
                  ? <PanelLeftClose className="h-4 w-4" />
                  : <PanelLeftOpen className="h-4 w-4" />
                }
              </motion.span>
            </AnimatePresence>
          </button>

          {/* Mobile menu */}
          <button
            onClick={onMobileMenuClick ?? onMenuClick}
            className="lg:hidden flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            aria-label="Open menu"
          >
            <Menu className="h-4 w-4" />
          </button>

          {/* Breadcrumb pill */}
          <motion.nav
            key={pathname}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="topbar-breadcrumb hidden sm:flex min-w-0 items-center gap-1 rounded-full px-3.5 py-1.5 text-xs"
          >
            <Link
              href="/dashboard"
              className="font-body font-light text-muted-foreground hover:text-foreground transition-colors"
            >
              Home
            </Link>
            {breadcrumbs.map((crumb) => (
              <span key={crumb.href} className="flex min-w-0 items-center gap-1">
                <ChevronRight className="h-3 w-3 shrink-0 text-border" />
                {crumb.isLast ? (
                  <span className="font-body font-medium text-foreground truncate">{crumb.label}</span>
                ) : (
                  <Link
                    href={crumb.href}
                    className="font-body font-light text-muted-foreground hover:text-foreground transition-colors truncate"
                  >
                    {crumb.label}
                  </Link>
                )}
              </span>
            ))}
          </motion.nav>

          {/* Mobile: page name only */}
          <span className="sm:hidden font-heading italic text-base text-foreground">
            {breadcrumbs[breadcrumbs.length - 1]?.label || 'Dashboard'}
          </span>
        </div>

        {/* Right: actions pill */}
        <div className="topbar-actions flex items-center gap-0.5 rounded-full px-1 py-1">
          {/* Theme toggle */}
          <button
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            aria-label="Toggle theme"
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={resolvedTheme ?? 'light'}
                initial={{ opacity: 0, scale: 0.7, rotate: -30 }}
                animate={{ opacity: 1, scale: 1, rotate: 0 }}
                exit={{ opacity: 0, scale: 0.7, rotate: 30 }}
                transition={{ duration: 0.15 }}
              >
                {resolvedTheme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
              </motion.span>
            </AnimatePresence>
          </button>

          {/* Notifications */}
          <Link href={notificationsHref}>
            <button className="relative flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:text-foreground hover:bg-muted transition-all">
              <Bell className="h-3.5 w-3.5" />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          </Link>

          {/* Avatar */}
          <Link href="/profile">
            <div className="topbar-avatar ml-0.5 flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-primary cursor-pointer transition-colors">
              {initials}
            </div>
          </Link>
        </div>
      </div>
    </header>
  )
}
