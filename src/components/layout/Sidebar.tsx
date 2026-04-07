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
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Package className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-stone-100 leading-none">DLM Engine</p>
          <p className="text-[10px] text-stone-500 mt-0.5">Device Lifecycle OS</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-5">
        {filteredSections.map((section) => (
          <div key={section.title}>
            <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-600">
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
                        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
                        isActive
                          ? 'bg-white/[0.07] text-stone-100'
                          : 'text-stone-500 hover:bg-white/[0.04] hover:text-stone-300'
                      )}
                    >
                      <item.icon className={cn('h-[15px] w-[15px] shrink-0', isActive ? 'text-primary' : '')} />
                      <span className="flex-1 truncate font-medium">{item.title}</span>
                      {isActive && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User profile */}
      <div className="border-t border-white/[0.07] p-3">
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <Link href="/profile" onClick={onNavigate} className="flex items-center gap-3 min-w-0 flex-1">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-xs font-bold text-primary">
              {initials}
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-stone-200 leading-none">{user?.full_name || 'User'}</p>
              <p className="truncate text-[10px] text-stone-500 mt-0.5 capitalize">{user?.role?.replace('_', ' ') || 'Role'}</p>
            </div>
          </Link>
          <button
            onClick={logout}
            className="shrink-0 rounded-md p-1.5 text-stone-600 hover:bg-white/[0.06] hover:text-stone-300 transition-colors"
            title="Sign out"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  )
}
