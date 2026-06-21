import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'

export interface MonthlyPoint {
  month: string       // "YYYY-MM"
  order_count: number
  total_value: number
}

export interface OrderAnalytics {
  monthly: MonthlyPoint[]
  all_time: { total_orders: number; total_value: number }
}

export function useOrderAnalytics() {
  const { user } = useAuth()
  const enabled = !!user && ['admin', 'coe_manager', 'coe_tech', 'sales'].includes(user.role)

  return useQuery<OrderAnalytics>({
    queryKey: ['analytics', 'orders'],
    queryFn: async () => {
      const res = await fetch('/api/analytics/orders')
      if (!res.ok) throw new Error('Failed to fetch analytics')
      return res.json()
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  })
}

/** Same shape as useOrderAnalytics, scoped to the logged-in customer's own orders. */
export function useCustomerOrderAnalytics() {
  const { user } = useAuth()
  const enabled = !!user && user.role === 'customer'

  return useQuery<OrderAnalytics>({
    queryKey: ['analytics', 'orders', 'customer', user?.id],
    queryFn: async () => {
      const res = await fetch('/api/customer/dashboard/analytics')
      if (!res.ok) throw new Error('Failed to fetch analytics')
      return res.json()
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  })
}
