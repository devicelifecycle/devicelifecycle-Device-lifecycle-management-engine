'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useMemo } from 'react'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Boxes,
  Building2,
  ClipboardCheck,
  DollarSign,
  Percent,
  FilePlus2,
  FileText,
  Gavel,
  Layers,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Network,
  Package,
  Receipt,
  Shield,
  ShoppingCart,
  SlidersHorizontal,
  Store,
  TrendingDown,
  Trophy,
  Truck,
  UserCog,
  Users,
} from 'lucide-react'
import { ByteBackMark } from '@/components/brand/ByteBackMark'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { useDashboardCounts } from '@/hooks/useDashboardCounts'
import { useBranding } from '@/lib/branding-context'

interface NavItem {
  title: string
  href: string
  icon: React.ElementType
  roles?: string[]
  countKey?: 'pendingBids' | 'actionableOrders'
  /** Only the org's designated org admin sees this item — checked alongside roles. */
  requiresOrgAdmin?: boolean
  /** Onboarding tour anchor — matches a target in src/lib/onboarding/tours.ts. */
  tourId?: string
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
      { title: 'Support', href: '/tickets', icon: LifeBuoy },
    ],
  },
  {
    title: 'Workflow',
    items: [
      { title: 'Orders', href: '/orders', icon: ShoppingCart, roles: ['admin', 'coe_manager', 'coe_tech', 'sales'], countKey: 'actionableOrders', tourId: 'nav-orders' },
      { title: 'My Orders', href: '/customer/orders', icon: ShoppingCart, roles: ['customer'], tourId: 'nav-my-orders' },
      { title: 'Requests', href: '/customer/requests', icon: FilePlus2, roles: ['customer'] },
      { title: 'Device Register', href: '/customer/assets', icon: Boxes, roles: ['customer'] },
      { title: 'Company Profile', href: '/customer/company', icon: Building2, roles: ['customer'] },
      { title: 'Reports', href: '/customer/reports', icon: BarChart3, roles: ['customer'] },
      { title: 'Vendor Orders', href: '/vendor/orders', icon: Truck, roles: ['vendor'], tourId: 'nav-vendor-orders' },
      { title: 'My Bids', href: '/vendor/bids', icon: Gavel, roles: ['vendor'], countKey: 'pendingBids' },
      { title: 'Performance', href: '/vendor/performance', icon: Trophy, roles: ['vendor'] },
      { title: 'Payouts', href: '/vendor/payouts', icon: DollarSign, roles: ['vendor'] },
      { title: 'Team', href: '/customer/team', icon: UserCog, roles: ['customer'], requiresOrgAdmin: true },
      { title: 'Team', href: '/vendor/team', icon: UserCog, roles: ['vendor'], requiresOrgAdmin: true },
      { title: 'Team', href: '/var/team', icon: UserCog, roles: ['var_entity_admin', 'var_regional_manager'] },
      { title: 'Reports', href: '/var/reports', icon: BarChart3, roles: ['var_entity_admin', 'var_regional_manager', 'var_sales_rep'] },
      { title: 'Customers', href: '/customers', icon: Users, roles: ['admin', 'coe_manager', 'sales'] },
      { title: 'Vendors', href: '/vendors', icon: Building2, roles: ['admin', 'coe_manager', 'sales'] },
      { title: 'Bids', href: '/bids', icon: Gavel, roles: ['admin', 'coe_manager', 'sales'], countKey: 'pendingBids' },
      { title: 'Devices', href: '/devices', icon: Package, roles: ['admin', 'coe_manager'] },
    ],
  },
  {
    title: 'Operations',
    items: [
      { title: 'Receiving', href: '/coe/receiving', icon: Truck, roles: ['admin', 'coe_manager', 'coe_tech'] },
      { title: 'Triage', href: '/coe/triage', icon: ClipboardCheck, roles: ['admin', 'coe_manager', 'coe_tech'], tourId: 'nav-triage' },
      { title: 'Exceptions', href: '/coe/exceptions', icon: AlertTriangle, roles: ['admin', 'coe_manager'] },
      { title: 'Shipping', href: '/coe/shipping', icon: Truck, roles: ['admin', 'coe_manager', 'coe_tech'] },
      { title: 'CPO IMEI Intake', href: '/coe/imei', icon: Package, roles: ['admin', 'coe_manager', 'coe_tech'] },
    ],
  },
  {
    title: 'Control',
    items: [
      { title: 'Reports', href: '/reports', icon: BarChart3, roles: ['admin', 'coe_manager'] },
      { title: 'Organizations', href: '/admin/organizations', icon: Building2, roles: ['admin'] },
      { title: 'VARs', href: '/admin/tenants', icon: Network, roles: ['admin'] },
      { title: 'VAR Console', href: '/var', icon: Store, roles: ['admin', 'var_entity_admin', 'var_regional_manager', 'var_sales_rep'] },
      { title: 'Features', href: '/var/features', icon: SlidersHorizontal, roles: ['var_entity_admin', 'admin'] },
      { title: 'Customers', href: '/var/customers', icon: Users, roles: ['var_entity_admin', 'admin'] },
      { title: 'Pricing', href: '/admin/pricing', icon: DollarSign, roles: ['admin'] },
      { title: 'Residual Value', href: '/admin/rve', icon: TrendingDown, roles: ['admin', 'coe_manager', 'sales'] },
      { title: 'Commission', href: '/admin/commission', icon: Percent, roles: ['admin'] },
      { title: 'Plans', href: '/admin/plans', icon: Layers, roles: ['admin'] },
      { title: 'Billing', href: '/admin/billing', icon: Receipt, roles: ['admin'] },
      { title: 'Commission Report', href: '/admin/reports/commission', icon: BarChart3, roles: ['admin'] },
      { title: 'Platform Analytics', href: '/admin/reports/platform', icon: Activity, roles: ['admin'] },
      { title: 'SLA Rules', href: '/admin/sla-rules', icon: FileText, roles: ['admin'] },
      { title: 'Users', href: '/admin/users', icon: Shield, roles: ['admin'], tourId: 'nav-users' },
      { title: 'Roles & Access', href: '/admin/roles', icon: Shield, roles: ['admin'] },
      { title: 'Audit Log', href: '/admin/audit-log', icon: FileText, roles: ['admin'] },
    ],
  },
]

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const router = useRouter()
  const { user, hasRole, logout } = useAuth()
  const counts = useDashboardCounts()
  const branding = useBranding()

  function BrandedLogo({ className = '' }: { className?: string }) {
    if (branding.logoUrl) {
      return (
        <img
          src={branding.logoUrl}
          alt={branding.name}
          className={`h-4 w-4 object-contain ${className}`}
        />
      )
    }
    if (branding.logoText) {
      return (
        <span
          className={`flex items-center justify-center font-body font-bold ${className}`}
          style={{ color: `var(--primary)` }}
        >
          {branding.logoText}
        </span>
      )
    }
    return <ByteBackMark className={`h-4 w-4 ${className}`} />
  }

  const filteredSections = useMemo(
    () =>
      navSections
        .map((section) => ({
          ...section,
          items: section.items.filter((item) =>
            (!item.roles || item.roles.some((role) => hasRole(role as any))) &&
            (!item.requiresOrgAdmin || !!user?.is_org_admin)
          ),
        }))
        .filter((section) => section.items.length > 0),
    [hasRole, user]
  )

  const initials = user?.full_name
    ? user.full_name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase()
    : 'U'

  return (
    <aside className="sidebar-surface flex h-full w-[280px] flex-col overflow-hidden border-r border-white/[0.10]">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-[18px]">
        <div className="liquid-glass-strong flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white">
          <BrandedLogo className="h-4 w-4 text-primary" />
        </div>
        <div>
          <p className="font-heading font-bold text-[15px] text-white leading-none tracking-tight">{branding.name || 'Byte-Back'}</p>
          <p className="font-body text-[10px] text-white/35 mt-0.5 font-light tracking-wide">{branding.tagline || 'Device Lifecycle Management Platform'}</p>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-4 h-px bg-white/[0.06]" />

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4" data-tour="sidebar-nav">
        {filteredSections.map((section) => (
          <div key={section.title}>
            <p className="mb-1.5 px-2 font-body text-[10px] font-semibold uppercase tracking-[0.2em] text-white/50">
              {section.title}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== '/dashboard' && pathname.startsWith(`${item.href}/`))
                return (
                  <Link key={item.title} href={item.href} onClick={onNavigate} prefetch={false} onMouseEnter={() => router.prefetch(item.href)}>
                    <div
                      data-tour={item.tourId}
                      className={cn(
                        'group relative flex items-center gap-3 rounded-xl px-3 py-3 font-body text-sm transition-all duration-200',
                        isActive
                          ? 'liquid-glass text-white'
                          : 'text-white/65 hover:text-white/90'
                      )}
                    >
                      {/* Active left accent */}
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-full bg-primary" />
                      )}
                      <item.icon
                        className={cn(
                          'h-[18px] w-[18px] shrink-0 transition-colors',
                          isActive ? 'text-primary' : 'text-white/50 group-hover:text-white/80'
                        )}
                      />
                      <span className={cn('flex-1 truncate text-[14px]', isActive ? 'font-semibold' : 'font-normal')}>
                        {item.title}
                      </span>
                      {item.countKey && (counts[item.countKey] ?? 0) > 0 && (
                        <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
                          {(counts[item.countKey] ?? 0) > 99 ? '99+' : counts[item.countKey]}
                        </span>
                      )}
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
            className="shrink-0 flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[11px] font-bold text-white/70 hover:text-white hover:bg-white/[0.06] transition-all"
            title="Log out"
          >
            <LogOut className="h-3.5 w-3.5" />
            Log out
          </button>
        </div>
      </div>
    </aside>
  )
}
