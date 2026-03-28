// ============================================================================
// ORDERS HOOK
// ============================================================================

import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
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

export function useOrders(filters: OrderFilters = {}) {
  const queryClient = useQueryClient()
  const supabase = createBrowserSupabaseClient()

  // Query for orders list
  const ordersQuery = useQuery({
    queryKey: ['orders', filters],
    queryFn: () => fetchOrders(filters),
  })

  // Supabase Realtime — auto-refresh on INSERT/UPDATE/DELETE
  useEffect(() => {
    const channel = supabase
      .channel('orders-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['orders'] })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient, supabase])

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })

  // Mutation for transitioning order status
  const transitionMutation = useMutation({
    mutationFn: ({ id, status, notes }: { id: string; status: OrderStatus; notes?: string }) =>
      transitionOrder(id, status, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })

  // Bulk transition mutation
  const bulkTransitionMutation = useMutation({
    mutationFn: ({ orderIds, toStatus, notes }: { orderIds: string[]; toStatus: OrderStatus; notes?: string }) =>
      bulkTransitionOrders(orderIds, toStatus, notes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: (orderIds: string[]) => bulkDeleteOrders(orderIds),
    onSuccess: () => {
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
  }
}

export function useOrder(id: string | null) {
  const queryClient = useQueryClient()

  const orderQuery = useQuery({
    queryKey: ['order', id],
    queryFn: () => (id ? fetchOrderById(id) : null),
    enabled: !!id,
  })

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Order>) => updateOrder(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['order', id] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })

  const transitionMutation = useMutation({
    mutationFn: ({ status, notes }: { status: OrderStatus; notes?: string }) =>
      transitionOrder(id!, status, notes),
    onSuccess: () => {
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
