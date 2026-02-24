// ============================================================================
// DASHBOARD SIDEBAR COMPONENT
// ============================================================================

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import {
  LayoutDashboard,
  ShoppingCart,
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
      { title: 'Dashboard', href: '/', icon: LayoutDashboard },
      { title: 'Notifications', href: '/notifications', icon: Bell },
    ],
  },
  {
    title: 'Operations',
    items: [
      { title: 'Orders', href: '/orders', icon: ShoppingCart },
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
    <aside className="flex h-full w-[260px] flex-col bg-[hsl(224,71%,4%)] text-white">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500">
          <Package className="h-5 w-5 text-white" />
        </div>
        <div>
          <span className="font-bold text-sm tracking-tight">Enterprise Engine</span>
          <span className="block text-[10px] text-blue-400 font-medium tracking-wider uppercase">DLME Platform</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {filteredSections.map((section) => {
          const isCollapsed = collapsedSections.includes(section.title)
          return (
            <div key={section.title}>
              <button
                onClick={() => toggleSection(section.title)}
                className="flex w-full items-center justify-between px-3 mb-2"
              >
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  {section.title}
                </span>
                <ChevronDown className={cn(
                  "h-3 w-3 text-slate-500 transition-transform",
                  isCollapsed && "-rotate-90"
                )} />
              </button>
              {!isCollapsed && (
                <div className="space-y-0.5">
                  {section.items.map((item) => {
                    const isActive = pathname === item.href || 
                      (item.href !== '/' && pathname.startsWith(`${item.href}/`))
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
                          isActive
                            ? 'bg-blue-600/20 text-blue-400'
                            : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                        )}
                      >
                        <item.icon className={cn("h-4 w-4", isActive && "text-blue-400")} />
                        {item.title}
                        {isActive && (
                          <div className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-400" />
                        )}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* User section */}
      <div className="border-t border-white/10 p-3">
        <Link href="/profile" className="flex items-center gap-3 rounded-lg p-3 hover:bg-white/5 transition-colors">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white text-sm font-bold shadow-lg shadow-blue-500/20">
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
