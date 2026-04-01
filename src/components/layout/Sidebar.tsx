'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Building2,
  ChevronDown,
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
  const [collapsedSections, setCollapsedSections] = useState<string[]>([])

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

  return (
    <aside className="sidebar-surface flex h-full w-[292px] flex-col overflow-hidden text-stone-100">
      <div className="relative border-b border-white/8 px-6 pb-6 pt-7">
        <div className="absolute inset-x-0 top-0 h-px copper-line opacity-70" />
        <div className="eyebrow-label mb-5">Operational Studio</div>
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-[1.35rem] bg-primary text-primary-foreground shadow-[0_20px_40px_-22px_rgba(182,93,47,0.9)]">
            <Package className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <p className="editorial-title text-3xl leading-none brand-gradient">DLM</p>
            <p className="text-sm font-medium text-stone-200">Device Lifecycle Engine</p>
            <p className="text-xs uppercase tracking-[0.25em] text-stone-500">Trade-In + CPO OS</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-7 overflow-y-auto px-4 py-6">
        {filteredSections.map((section) => {
          const isCollapsed = collapsedSections.includes(section.title)
          return (
            <div key={section.title} className="space-y-2">
              <button
                className="flex w-full items-center justify-between px-3 text-left"
                onClick={() =>
                  setCollapsedSections((prev) =>
                    prev.includes(section.title) ? prev.filter((s) => s !== section.title) : [...prev, section.title]
                  )
                }
              >
                <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-stone-500">{section.title}</span>
                <ChevronDown
                  className={cn('h-4 w-4 text-stone-600 transition-transform', isCollapsed && '-rotate-90')}
                />
              </button>

              <AnimatePresence initial={false}>
                {!isCollapsed && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22 }}
                    className="overflow-hidden"
                  >
                    <div className="space-y-1">
                      {section.items.map((item) => {
                        const isActive =
                          pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`))
                        return (
                          <Link key={item.href} href={item.href} onClick={onNavigate} prefetch={false}>
                            <div
                              className={cn(
                                'group relative flex items-center gap-3 rounded-[1.1rem] px-3.5 py-3 text-sm transition-all duration-200',
                                isActive
                                  ? 'bg-white/[0.075] text-stone-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]'
                                  : 'text-stone-400 hover:bg-white/[0.04] hover:text-stone-200'
                              )}
                            >
                              {isActive && <div className="absolute inset-y-3 left-0 w-1 rounded-full bg-primary" />}
                              <div
                                className={cn(
                                  'flex h-9 w-9 items-center justify-center rounded-xl border transition-colors',
                                  isActive
                                    ? 'border-primary/30 bg-primary/15 text-primary'
                                    : 'border-white/5 bg-white/[0.03] text-stone-500 group-hover:border-white/10 group-hover:text-stone-200'
                                )}
                              >
                                <item.icon className="h-4 w-4" />
                              </div>
                              <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                                <span className="truncate font-medium">{item.title}</span>
                                {isActive && <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_14px_rgba(209,124,67,0.8)]" />}
                              </div>
                            </div>
                          </Link>
                        )
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </nav>

      <div className="border-t border-white/8 p-4">
        <Link href="/profile" onClick={onNavigate} className="surface-muted block rounded-[1.4rem] p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-[1rem] bg-primary/15 text-base font-semibold text-primary">
              {user?.full_name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-stone-100">{user?.full_name || 'User'}</p>
              <p className="truncate text-xs uppercase tracking-[0.18em] text-stone-500">
                {user?.role?.replace('_', ' ') || 'Role'}
              </p>
            </div>
            <button
              onClick={(event) => {
                event.preventDefault()
                logout()
              }}
              className="rounded-xl border border-white/8 bg-white/[0.03] p-2.5 text-stone-400 hover:border-primary/20 hover:text-stone-100"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </Link>
      </div>
    </aside>
  )
}
