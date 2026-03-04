// ============================================================================
// DASHBOARD HEADER COMPONENT
// ============================================================================

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, Menu, ChevronRight, Sparkles, Sun, Moon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useNotifications } from '@/hooks/useNotifications'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { snakeToTitle } from '@/lib/utils'

interface HeaderProps {
  onMenuClick?: () => void
}

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function Header({ onMenuClick }: HeaderProps) {
  const { unreadCount } = useNotifications()
  const { user } = useAuth()
  const { resolvedTheme, setTheme } = useTheme()
  const pathname = usePathname()

  // Generate breadcrumbs from pathname
  const segments = pathname.split('/').filter(Boolean)
  const breadcrumbs = segments.map((segment, index) => {
    const href = '/' + segments.slice(0, index + 1).join('/')
    const isLast = index === segments.length - 1
    // Skip UUID-like segments
    const isId = segment.match(/^[0-9a-f-]{36}$/)
    const label = isId ? 'Details' : snakeToTitle(segment.replace(/-/g, '_'))
    return { href, label, isLast }
  })

  return (
    <header className="relative flex h-14 items-center justify-between border-b border-white/5 bg-[#050508]/90 backdrop-blur-2xl px-6 sticky top-0 z-40">
      {/* Left side */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden h-8 w-8"
          onClick={onMenuClick}
        >
          <Menu className="h-4 w-4" />
        </Button>

        {/* Breadcrumbs */}
        <motion.nav
          key={pathname}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3 }}
          className="hidden md:flex items-center gap-1 text-sm"
        >
          <Link href="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
            Home
          </Link>
          {breadcrumbs.map((crumb) => (
            <span key={crumb.href} className="flex items-center gap-1">
              <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
              {crumb.isLast ? (
                <span className="font-medium text-foreground">{crumb.label}</span>
              ) : (
                <Link href={crumb.href} className="text-muted-foreground hover:text-foreground transition-colors">
                  {crumb.label}
                </Link>
              )}
            </span>
          ))}
        </motion.nav>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* Greeting */}
        <motion.div
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="hidden lg:flex items-center gap-1.5 text-sm text-muted-foreground"
        >
          <Sparkles className="h-3.5 w-3.5 text-cyan-500" />
          <span>{getGreeting()}, <span className="font-medium text-foreground">{user?.full_name?.split(' ')[0] || 'User'}</span></span>
        </motion.div>

        {/* Divider */}
        <div className="hidden lg:block h-5 w-px bg-border" />

        {/* Dark Mode Toggle */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={resolvedTheme ?? 'light'}
              initial={{ y: -10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 10, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </motion.div>
          </AnimatePresence>
        </Button>

        {/* Notifications */}
        <Link href="/notifications">
          <Button variant="ghost" size="icon" className="relative h-9 w-9">
            <motion.div
              animate={unreadCount > 0 ? { rotate: [0, -10, 10, -10, 0] } : {}}
              transition={{ duration: 0.5, repeat: Infinity, repeatDelay: 5 }}
            >
              <Bell className="h-4 w-4" />
            </motion.div>
            <AnimatePresence>
              {unreadCount > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 15 }}
                  className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-cyan-500 text-[10px] font-bold text-black ring-2 ring-background shadow-sm"
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </motion.span>
              )}
            </AnimatePresence>
          </Button>
        </Link>
      </div>

      {/* Bottom accent line — cinematic glow */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
      <div className="absolute bottom-0 left-1/4 right-1/4 h-px bg-primary/20 blur-sm" />
    </header>
  )
}
