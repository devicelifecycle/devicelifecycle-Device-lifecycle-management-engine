// ============================================================================
// DASHBOARD HEADER COMPONENT
// ============================================================================

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, Menu, ChevronRight } from 'lucide-react'
import { useNotifications } from '@/hooks/useNotifications'
import { Button } from '@/components/ui/button'
import { snakeToTitle } from '@/lib/utils'

interface HeaderProps {
  onMenuClick?: () => void
}

export function Header({ onMenuClick }: HeaderProps) {
  const { unreadCount } = useNotifications()
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
    <header className="flex h-14 items-center justify-between border-b border-border/60 bg-background/90 backdrop-blur-md px-6 sticky top-0 z-40">
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
        <nav className="hidden md:flex items-center gap-1 text-sm">
          <Link href="/" className="text-muted-foreground hover:text-foreground transition-colors">
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
        </nav>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* Notifications */}
        <Link href="/notifications">
          <Button variant="ghost" size="icon" className="relative h-9 w-9">
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-teal-500 text-[10px] font-bold text-white ring-2 ring-background shadow-sm">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Button>
        </Link>
      </div>
    </header>
  )
}
