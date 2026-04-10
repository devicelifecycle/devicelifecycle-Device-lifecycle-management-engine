import { useQuery } from '@tanstack/react-query'
import type { Order } from '@/types'

type CustomerDashboardOrder = Pick<
  Order,
  'id' | 'order_number' | 'type' | 'status' | 'quoted_amount' | 'total_amount' | 'created_at' | 'updated_at'
>

interface CustomerDashboardResponse {
  total_orders: number
  active_orders: number
  quotes_ready: number
  completed_orders: number
  visible_value: number
  recent_orders: CustomerDashboardOrder[]
}

async function fetchCustomerDashboard(): Promise<CustomerDashboardResponse> {
  const response = await fetch('/api/customer/dashboard')
  if (!response.ok) {
    throw new Error('Failed to fetch customer dashboard')
  }
  return response.json()
}

export function useCustomerDashboard() {
  const query = useQuery({
    queryKey: ['customer-dashboard'],
    queryFn: fetchCustomerDashboard,
    refetchInterval: 30 * 1000,
    retry: 1,
  })

  return {
    summary: query.data,
    recentOrders: query.data?.recent_orders || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}
