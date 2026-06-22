// ============================================================================
// ORDERS HOOK
// ============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Order, OrderStatus, OrderType } from '@/types'

interface OrderFilters {
  status?: OrderStatus
  type?: OrderType
  customer_id?: string
  vendor_id?: string
  assigned_to_id?: string
  search?: string
  page?: number
  page_size?: number
  sort_by?: 'created_at' | 'updated_at' | 'order_number' | 'status' | 'total_amount' | 'quoted_amount'
  sort_order?: 'asc' | 'desc'
}

interface OrdersResponse {
  data: Order[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

interface BulkResult {
  results: { id: string; success: boolean; error?: string }[]
  succeeded: number
  failed: number
}

async function fetchOrders(filters: OrderFilters): Promise<OrdersResponse> {
  const params = new URLSearchParams()

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      params.append(key, String(value))
    }
  })

  const response = await fetch(`/api/orders?${params.toString()}`)
  if (!response.ok) {
    throw new Error('Failed to fetch orders')
  }
  return response.json()
}

async function fetchOrderById(id: string): Promise<Order> {
  const response = await fetch(`/api/orders/${id}`)
  if (!response.ok) {
    throw new Error('Failed to fetch order')
  }
  return response.json()
}

async function createOrder(data: Partial<Order>): Promise<Order> {
  const response = await fetch('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(typeof err?.error === 'string' ? err.error : 'Failed to create order')
  }
  return response.json()
}

async function updateOrder(id: string, data: Partial<Order>): Promise<Order> {
  const response = await fetch(`/api/orders/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    throw new Error('Failed to update order')
  }
  return response.json()
}

async function transitionOrder(id: string, newStatus: OrderStatus, notes?: string): Promise<Order> {
  const response = await fetch(`/api/orders/${id}/transition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to_status: newStatus, notes }),
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    const msg = typeof err?.error === 'string' ? err.error : Array.isArray(err?.details) ? err.details.map((d: { message?: string }) => d.message).filter(Boolean).join('; ') || 'Failed to transition order' : 'Failed to transition order'
    throw new Error(msg)
  }
  return response.json()
}

async function bulkTransitionOrders(orderIds: string[], toStatus: OrderStatus, notes?: string): Promise<BulkResult> {
  const response = await fetch('/api/orders/bulk-transition', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order_ids: orderIds, to_status: toStatus, notes }),
  })
  if (!response.ok) {
    throw new Error('Failed to bulk transition orders')
  }
  return response.json()
}

async function bulkDeleteOrders(orderIds: string[]): Promise<BulkResult> {
  const response = await fetch('/api/orders/bulk-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order_ids: orderIds }),
  })
  if (!response.ok) {
    throw new Error('Failed to bulk delete orders')
  }
  return response.json()
}

interface BulkRequoteResult {
  results: { id: string; success: boolean; error?: string; old_amount?: number; new_amount?: number; items_repriced?: number }[]
  succeeded: number
  failed: number
}

async function bulkRequoteOrders(orderIds: string[]): Promise<BulkRequoteResult> {
  const response = await fetch('/api/orders/bulk-requote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ order_ids: orderIds }),
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(typeof err?.error === 'string' ? err.error : 'Failed to bulk re-quote orders')
  }
  return response.json()
}

export function useOrders(filters: OrderFilters = {}) {
  const queryClient = useQueryClient()

  // Realtime invalidation is handled globally by useRealtimeSync in providers.tsx.
  // Poll every 30s as a safety net for Realtime reconnections.
  const ordersQuery = useQuery({
    queryKey: ['orders', filters],
    queryFn: () => fetchOrders(filters),
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
    refetchIntervalInBackground: false,
  })

  // Mutation for creating orders
  const createMutation = useMutation({
    mutationFn: createOrder,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })

  // Mutation for updating orders
  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Order> }) =>
      updateOrder(id, data),
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ['orders'] })
      const snapshots = queryClient.getQueriesData<OrdersResponse>({ queryKey: ['orders'] })
      queryClient.setQueriesData<OrdersResponse>({ queryKey: ['orders'] }, (old) => {
        if (!old) return old
        return { ...old, data: old.data.map(o => o.id === id ? { ...o, ...data } : o) }
      })
      return { snapshots }
    },
    onError: (_err, _vars, context) => {
      context?.snapshots.forEach(([key, value]) => queryClient.setQueryData(key, value))
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })

  // Mutation for transitioning order status
  const transitionMutation = useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: OrderStatus; notes?: string }) =>
      transitionOrder(id, status, notes),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ['orders'] })
      const snapshots = queryClient.getQueriesData<OrdersResponse>({ queryKey: ['orders'] })
      queryClient.setQueriesData<OrdersResponse>({ queryKey: ['orders'] }, (old) => {
        if (!old) return old
        return { ...old, data: old.data.map(o => o.id === id ? { ...o, status } : o) }
      })
      return { snapshots }
    },
    onError: (_err, _vars, context) => {
      context?.snapshots.forEach(([key, value]) => queryClient.setQueryData(key, value))
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })

  // Bulk transition mutation
  const bulkTransitionMutation = useMutation({
    mutationFn: ({ orderIds, toStatus, notes }: { orderIds: string[]; toStatus: OrderStatus; notes?: string }) =>
      bulkTransitionOrders(orderIds, toStatus, notes),
    onMutate: async ({ orderIds, toStatus }) => {
      await queryClient.cancelQueries({ queryKey: ['orders'] })
      const snapshots = queryClient.getQueriesData<OrdersResponse>({ queryKey: ['orders'] })
      const idSet = new Set(orderIds)
      queryClient.setQueriesData<OrdersResponse>({ queryKey: ['orders'] }, (old) => {
        if (!old) return old
        return { ...old, data: old.data.map(o => idSet.has(o.id) ? { ...o, status: toStatus } : o) }
      })
      return { snapshots }
    },
    onError: (_err, _vars, context) => {
      context?.snapshots.forEach(([key, value]) => queryClient.setQueryData(key, value))
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: (orderIds: string[]) => bulkDeleteOrders(orderIds),
    onMutate: async (orderIds) => {
      await queryClient.cancelQueries({ queryKey: ['orders'] })
      const snapshots = queryClient.getQueriesData<OrdersResponse>({ queryKey: ['orders'] })
      const idSet = new Set(orderIds)
      queryClient.setQueriesData<OrdersResponse>({ queryKey: ['orders'] }, (old) => {
        if (!old) return old
        const filtered = old.data.filter(o => !idSet.has(o.id))
        return { ...old, data: filtered, total: old.total - (old.data.length - filtered.length) }
      })
      return { snapshots }
    },
    onError: (_err, _vars, context) => {
      context?.snapshots.forEach(([key, value]) => queryClient.setQueryData(key, value))
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })

  // Bulk re-quote mutation
  const bulkRequoteMutation = useMutation({
    mutationFn: (orderIds: string[]) => bulkRequoteOrders(orderIds),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })

  return {
    orders: ordersQuery.data?.data || [],
    total: ordersQuery.data?.total || 0,
    page: ordersQuery.data?.page || 1,
    totalPages: ordersQuery.data?.total_pages || 1,
    isLoading: ordersQuery.isLoading,
    error: ordersQuery.error,
    refetch: ordersQuery.refetch,

    create: createMutation.mutateAsync,
    isCreating: createMutation.isPending,

    update: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,

    transition: transitionMutation.mutateAsync,
    isTransitioning: transitionMutation.isPending,

    bulkTransition: bulkTransitionMutation.mutateAsync,
    isBulkTransitioning: bulkTransitionMutation.isPending,

    bulkDelete: bulkDeleteMutation.mutateAsync,
    isBulkDeleting: bulkDeleteMutation.isPending,

    bulkRequote: bulkRequoteMutation.mutateAsync,
    isBulkRequoting: bulkRequoteMutation.isPending,
  }
}

export function useOrder(id: string | null) {
  const queryClient = useQueryClient()

  const orderQuery = useQuery({
    queryKey: ['order', id],
    queryFn: () => (id ? fetchOrderById(id) : null),
    enabled: !!id,
    staleTime: 30 * 1000,
  })

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Order>) => updateOrder(id!, data),
    onMutate: async (data) => {
      await queryClient.cancelQueries({ queryKey: ['order', id] })
      const prevOrder = queryClient.getQueryData<Order>(['order', id])
      queryClient.setQueryData<Order>(['order', id], (old) => old ? { ...old, ...data } : old)
      return { prevOrder }
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(['order', id], context?.prevOrder)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })

  const transitionMutation = useMutation({
    mutationFn: ({ status, notes }: { status: OrderStatus; notes?: string }) =>
      transitionOrder(id!, status, notes),
    onMutate: async ({ status }) => {
      await queryClient.cancelQueries({ queryKey: ['order', id] })
      const prevOrder = queryClient.getQueryData<Order>(['order', id])
      queryClient.setQueryData<Order>(['order', id], (old) => old ? { ...old, status } : old)
      return { prevOrder }
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(['order', id], context?.prevOrder)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })

  return {
    order: orderQuery.data,
    isLoading: orderQuery.isLoading,
    error: orderQuery.error,
    refetch: orderQuery.refetch,

    update: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,

    transition: transitionMutation.mutateAsync,
    isTransitioning: transitionMutation.isPending,
  }
}
