'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { Bell, ChevronRight, Menu, Moon, Sparkles, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { useNotifications } from '@/hooks/useNotifications'
import { useAuth } from '@/hooks/useAuth'
import { snakeToTitle } from '@/lib/utils'

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function Header({ onMenuClick }: { onMenuClick?: () => void }) {
  const pathname = usePathname()
  const { unreadCount } = useNotifications()
  const { user } = useAuth()
  const { resolvedTheme, setTheme } = useTheme()

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
    <header className="topbar-surface sticky top-0 z-40 px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <Button variant="outline" size="icon" className="lg:hidden" onClick={onMenuClick}>
            <Menu className="h-4 w-4" />
          </Button>

          <div className="min-w-0">
            <div className="mb-1 flex items-center gap-2">
              <span className="eyebrow-label hidden sm:inline-flex">Control Layer</span>
              <span className="hidden text-xs uppercase tracking-[0.2em] text-stone-500 lg:inline">
                {getGreeting()}, {user?.full_name?.split(' ')[0] || 'Operator'}
              </span>
            </div>
            <motion.nav
              key={pathname}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex min-w-0 items-center gap-1 text-sm text-stone-400"
            >
              <Link href="/dashboard" className="truncate hover:text-stone-100">
                Home
              </Link>
              {breadcrumbs.map((crumb) => (
                <span key={crumb.href} className="flex min-w-0 items-center gap-1">
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-stone-600" />
                  {crumb.isLast ? (
                    <span className="truncate font-medium text-stone-100">{crumb.label}</span>
                  ) : (
                    <Link href={crumb.href} className="truncate hover:text-stone-100">
                      {crumb.label}
                    </Link>
                  )}
                </span>
              ))}
            </motion.nav>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-full border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-stone-400 md:flex">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span>Live operational view</span>
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          >
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={resolvedTheme ?? 'light'}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
              >
                {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </motion.span>
            </AnimatePresence>
          </Button>

          <Link href="/notifications">
            <Button variant="outline" size="icon" className="relative">
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </Button>
          </Link>
        </div>
      </div>
    </header>
  )
}
