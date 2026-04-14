'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useMemo } from 'react'
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Building2,
  ClipboardCheck,
  DollarSign,
  FilePlus2,
  FileText,
  LayoutDashboard,
  LogOut,
  Package,
  Shield,
  ShoppingCart,
  Truck,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'

interface NavItem {
  title: string
  href: string
  icon: React.ElementType
  roles?: string[]
}

interface NavSection {
  title: string
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    title: 'Command',
    items: [
      { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { title: 'Notifications', href: '/notifications', icon: Bell, roles: ['admin', 'coe_manager', 'coe_tech', 'sales', 'vendor'] },
      { title: 'Notifications', href: '/customer/notifications', icon: Bell, roles: ['customer'] },
    ],
  },
  {
    title: 'Workflow',
    items: [
      { title: 'Orders', href: '/orders', icon: ShoppingCart, roles: ['admin', 'coe_manager', 'coe_tech', 'sales'] },
      { title: 'My Orders', href: '/customer/orders', icon: ShoppingCart, roles: ['customer'] },
      { title: 'Requests', href: '/customer/requests', icon: FilePlus2, roles: ['customer'] },
      { title: 'Vendor Orders', href: '/vendor/orders', icon: Truck, roles: ['vendor'] },
      { title: 'Customers', href: '/customers', icon: Users, roles: ['admin', 'coe_manager', 'sales'] },
      { title: 'Vendors', href: '/vendors', icon: Building2, roles: ['admin', 'coe_manager', 'sales'] },
      { title: 'Devices', href: '/devices', icon: Package, roles: ['admin', 'coe_manager'] },
    ],
  },
  {
    title: 'Operations',
    items: [
      { title: 'Receiving', href: '/coe/receiving', icon: Truck, roles: ['admin', 'coe_manager', 'coe_tech'] },
      { title: 'Triage', href: '/coe/triage', icon: ClipboardCheck, roles: ['admin', 'coe_manager', 'coe_tech'] },
      { title: 'Exceptions', href: '/coe/exceptions', icon: AlertTriangle, roles: ['admin', 'coe_manager'] },
      { title: 'Shipping', href: '/coe/shipping', icon: Truck, roles: ['admin', 'coe_manager', 'coe_tech'] },
    ],
  },
  {
    title: 'Control',
    items: [
      { title: 'Reports', href: '/reports', icon: BarChart3, roles: ['admin', 'coe_manager'] },
      { title: 'Organizations', href: '/admin/organizations', icon: Building2, roles: ['admin'] },
      { title: 'Pricing', href: '/admin/pricing', icon: DollarSign, roles: ['admin'] },
      { title: 'SLA Rules', href: '/admin/sla-rules', icon: FileText, roles: ['admin'] },
      { title: 'Users', href: '/admin/users', icon: Shield, roles: ['admin'] },
      { title: 'Audit Log', href: '/admin/audit-log', icon: FileText, roles: ['admin'] },
    ],
  },
]

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const { user, hasRole, logout } = useAuth()

  const filteredSections = useMemo(
    () =>
      navSections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) => !item.roles || item.roles.some((role) => hasRole(role as any))),
        }))
        .filter((section) => section.items.length > 0),
    [hasRole]
  )

  const initials = user?.full_name
    ? user.full_name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : 'U'

  return (
    <aside className="sidebar-surface flex h-full w-[260px] flex-col overflow-hidden">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-[18px]">
        <div className="liquid-glass-strong flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white">
          <Package className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="font-heading italic text-[15px] text-white leading-none tracking-tight">DLM Engine</p>
          <p className="font-body text-[10px] text-white/35 mt-0.5 font-light tracking-wide">Device Lifecycle OS</p>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-4 h-px bg-white/[0.06]" />

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {filteredSections.map((section) => (
          <div key={section.title}>
            <p className="mb-1.5 px-2 font-body text-[9px] font-semibold uppercase tracking-[0.2em] text-white/25">
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`))
                return (
                  <Link key={item.title} href={item.href} onClick={onNavigate} prefetch={false}>
                    <div
                      className={cn(
                        'group relative flex items-center gap-3 rounded-xl px-3 py-2 font-body text-sm transition-all duration-200',
                        isActive
                          ? 'liquid-glass text-white'
                          : 'text-white/40 hover:text-white/75'
                      )}
                    >
                      {/* Active left accent */}
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-full bg-primary" />
                      )}
                      <item.icon
                        className={cn(
                          'h-[14px] w-[14px] shrink-0 transition-colors',
                          isActive ? 'text-primary' : 'text-white/30 group-hover:text-white/60'
                        )}
                      />
                      <span className={cn('flex-1 truncate text-[13px]', isActive ? 'font-medium' : 'font-light')}>
                        {item.title}
                      </span>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User profile */}
      <div className="mx-4 h-px bg-white/[0.06]" />
      <div className="p-3">
        <div className="liquid-glass rounded-xl px-3 py-2.5 flex items-center gap-3">
          <Link href="/profile" onClick={onNavigate} className="flex items-center gap-3 min-w-0 flex-1">
            <div className="liquid-glass-strong flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold text-primary">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate font-body text-xs font-medium text-white/80 leading-none">{user?.full_name || 'User'}</p>
              <p className="truncate font-body text-[10px] text-white/30 mt-0.5 font-light capitalize">
                {user?.role?.replace(/_/g, ' ') || 'Role'}
              </p>
            </div>
          </Link>
          <button
            onClick={logout}
            className="shrink-0 rounded-lg p-1.5 text-white/25 hover:text-white/60 hover:bg-white/[0.06] transition-all"
            title="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  )
}
