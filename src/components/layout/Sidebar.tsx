// ============================================================================
// DASHBOARD SIDEBAR COMPONENT
// ============================================================================

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import {
  LayoutDashboard,
  ShoppingCart,
  FilePlus2,
  Users,
  Building2,
  Package,
  BarChart3,
  Bell,
  Truck,
  ClipboardCheck,
  AlertTriangle,
  DollarSign,
  FileText,
  LogOut,
  Shield,
  ChevronDown,
} from 'lucide-react'
import { useState } from 'react'

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
    title: 'Overview',
    items: [
      { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { title: 'Notifications', href: '/notifications', icon: Bell },
    ],
  },
  {
    title: 'Operations',
    items: [
      { title: 'Orders', href: '/orders', icon: ShoppingCart },
      { title: 'My Orders', href: '/customer/orders', icon: ShoppingCart, roles: ['customer'] },
      { title: 'Requests', href: '/customer/requests', icon: FilePlus2, roles: ['customer'] },
      { title: 'Vendor Orders', href: '/vendor/orders', icon: Truck, roles: ['vendor'] },
      { title: 'Customers', href: '/customers', icon: Users, roles: ['admin', 'coe_manager', 'sales'] },
      { title: 'Vendors', href: '/vendors', icon: Building2, roles: ['admin', 'coe_manager', 'sales'] },
      { title: 'Devices', href: '/devices', icon: Package, roles: ['admin', 'coe_manager'] },
    ],
  },
  {
    title: 'COE',
    items: [
      { title: 'Receiving', href: '/coe/receiving', icon: Truck, roles: ['admin', 'coe_manager', 'coe_tech'] },
      { title: 'Triage', href: '/coe/triage', icon: ClipboardCheck, roles: ['admin', 'coe_manager', 'coe_tech'] },
      { title: 'Exceptions', href: '/coe/exceptions', icon: AlertTriangle, roles: ['admin', 'coe_manager'] },
      { title: 'Shipping', href: '/coe/shipping', icon: Truck, roles: ['admin', 'coe_manager', 'coe_tech'] },
    ],
  },
  {
    title: 'Analytics',
    items: [
      { title: 'Reports', href: '/reports', icon: BarChart3, roles: ['admin', 'coe_manager'] },
    ],
  },
  {
    title: 'Administration',
    items: [
      { title: 'Organizations', href: '/admin/organizations', icon: Building2, roles: ['admin'] },
      { title: 'Pricing', href: '/admin/pricing', icon: DollarSign, roles: ['admin'] },
      { title: 'SLA Rules', href: '/admin/sla-rules', icon: FileText, roles: ['admin'] },
      { title: 'Users', href: '/admin/users', icon: Shield, roles: ['admin'] },
      { title: 'Audit Log', href: '/admin/audit-log', icon: FileText, roles: ['admin'] },
    ],
  },
]

export function Sidebar() {
  const pathname = usePathname()
  const { user, hasRole, logout } = useAuth()
  const [collapsedSections, setCollapsedSections] = useState<string[]>([])

  const toggleSection = (title: string) => {
    setCollapsedSections(prev =>
      prev.includes(title)
        ? prev.filter(s => s !== title)
        : [...prev, title]
    )
  }

  const filteredSections = navSections
    .map(section => ({
      ...section,
      items: section.items.filter(item => {
        if (!item.roles) return true
        return item.roles.some(role => hasRole(role as any))
      }),
    }))
    .filter(section => section.items.length > 0)

  return (
    <aside className="flex h-full w-[260px] flex-col bg-slate-950 text-white border-r border-slate-800/80">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600">
          <Package className="h-5 w-5 text-white" />
        </div>
        <div>
          <span className="font-semibold text-sm tracking-tight text-white">DLM Engine</span>
          <span className="block text-[10px] text-slate-500 font-medium tracking-wider uppercase">Lifecycle</span>
        </div>
      </div>

      {/* Navigation */}
      <LayoutGroup>
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          {filteredSections.map((section, sIdx) => {
            const isCollapsed = collapsedSections.includes(section.title)
            return (
              <motion.div
                key={section.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: sIdx * 0.05 }}
              >
                <button
                  onClick={() => toggleSection(section.title)}
                  className="flex w-full items-center justify-between px-3 mb-2 group"
                >
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400/90 group-hover:text-slate-300 transition-colors">
                    {section.title}
                  </span>
                  <motion.div
                    animate={{ rotate: isCollapsed ? -90 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronDown className="h-3 w-3 text-slate-500" />
                  </motion.div>
                </button>
                <AnimatePresence initial={false}>
                  {!isCollapsed && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="space-y-0.5">
                        {section.items.map((item) => {
                          const isActive = pathname === item.href ||
                            (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`))
                          return (
                            <Link key={item.href} href={item.href}>
                              <div
                                className={cn(
                                  'relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors duration-200',
                                    isActive
                                    ? 'text-blue-400'
                                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
                                )}
                              >
                                {/* Sliding active background */}
                                {isActive && (
                                  <motion.div
                                    layoutId="sidebar-active"
                                    className="absolute inset-0 rounded-lg bg-blue-600/10"
                                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                                  />
                                )}
                                <item.icon className={cn("relative z-10 h-4 w-4 shrink-0", isActive && "text-blue-400")} />
                                <span className="relative z-10">{item.title}</span>
                                {isActive && (
                                  <div className="relative z-10 ml-auto h-2 w-2 rounded-full bg-blue-500" />
                                )}
                              </div>
                            </Link>
                          )
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </nav>
      </LayoutGroup>

      {/* User section */}
      <div className="border-t border-slate-800/80 p-3">
        <Link href="/profile" className="flex items-center gap-3 rounded-lg p-3 hover:bg-slate-800/50 transition-colors">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-700 text-slate-200 text-sm font-semibold">
            {user?.full_name?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-200 truncate">{user?.full_name || 'User'}</p>
            <p className="text-[11px] text-slate-500 capitalize">{user?.role?.replace('_', ' ') || 'Role'}</p>
          </div>
          <button
            onClick={(e) => { e.preventDefault(); logout() }}
            className="rounded-md p-1.5 text-slate-500 hover:bg-white/10 hover:text-slate-300 transition-colors"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </Link>
      </div>
    </aside>
  )
}
