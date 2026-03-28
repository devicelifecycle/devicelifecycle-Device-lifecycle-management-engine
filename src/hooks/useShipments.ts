// ============================================================================
// SHIPMENTS HOOK
// ============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Shipment } from '@/types'

interface ShipmentsResponse {
  data: Shipment[]
  total: number
  page: number
  total_pages: number
}

interface ShipmentFilters {
  direction?: 'inbound' | 'outbound'
  status?: string
  order_id?: string
}

async function fetchShipments(filters: ShipmentFilters = {}): Promise<ShipmentsResponse> {
  const params = new URLSearchParams()
  if (filters.direction) params.set('direction', filters.direction)
  if (filters.status) params.set('status', filters.status)
  if (filters.order_id) params.set('order_id', filters.order_id)

  const response = await fetch(`/api/shipments?${params.toString()}`)
  if (!response.ok) throw new Error('Failed to fetch shipments')
  return response.json()
}

async function fetchShipment(id: string): Promise<{ data: Shipment }> {
  const response = await fetch(`/api/shipments/${id}`)
  if (!response.ok) throw new Error('Failed to fetch shipment')
  return response.json()
}

interface CreateShipmentPayload {
  order_id: string
  direction: 'inbound' | 'outbound'
  carrier: string
  tracking_number?: string
  from_address: Record<string, unknown>
  to_address: Record<string, unknown>
  stallion_purchase?: boolean
  weight?: number
  dimensions?: { length: number; width: number; height: number }
  notes?: string
}

async function createShipment(payload: CreateShipmentPayload): Promise<Shipment> {
  const response = await fetch('/api/shipments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to create shipment')
  }
  const result = await response.json()
  return result.data ?? result
}

async function updateShipmentStatus(
  id: string,
  payload: { status?: string; action?: string; metadata?: Record<string, unknown> }
): Promise<Shipment> {
  const response = await fetch(`/api/shipments/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to update shipment')
  }
  const result = await response.json()
  return result.data
}

async function purchaseLabel(shipmentId: string): Promise<Shipment> {
  const response = await fetch(`/api/shipments/${shipmentId}/purchase-label`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to purchase label')
  }
  const result = await response.json()
  return result.data ?? result
}

export function useShipments(filters: ShipmentFilters = {}) {
  const queryClient = useQueryClient()
  const queryKey = ['shipments', filters]

  const shipmentsQuery = useQuery({
    queryKey,
    queryFn: () => fetchShipments(filters),
    refetchInterval: 30000, // Refresh every 30s for tracking updates
  })

  const createMutation = useMutation({
    mutationFn: createShipment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, ...payload }: { id: string; status?: string; action?: string; metadata?: Record<string, unknown> }) =>
      updateShipmentStatus(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
    },
  })

  const purchaseLabelMutation = useMutation({
    mutationFn: purchaseLabel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipments'] })
    },
  })

  return {
    shipments: shipmentsQuery.data?.data || [],
    total: shipmentsQuery.data?.total || 0,
    isLoading: shipmentsQuery.isLoading,
    error: shipmentsQuery.error,
    refetch: shipmentsQuery.refetch,

    create: createMutation.mutateAsync,
    isCreating: createMutation.isPending,

    updateStatus: updateStatusMutation.mutateAsync,
    isUpdating: updateStatusMutation.isPending,

    purchaseLabel: purchaseLabelMutation.mutateAsync,
    isPurchasingLabel: purchaseLabelMutation.isPending,
  }
}

export function useShipment(id: string | undefined) {
  const queryClient = useQueryClient()

  const shipmentQuery = useQuery({
    queryKey: ['shipment', id],
    queryFn: () => fetchShipment(id!),
    enabled: !!id,
    refetchInterval: 30000,
  })

  return {
    shipment: shipmentQuery.data?.data || null,
    isLoading: shipmentQuery.isLoading,
    error: shipmentQuery.error,
    refetch: shipmentQuery.refetch,
  }
}

export function useOrderShipments(orderId: string | undefined) {
  const shipmentsQuery = useQuery({
    queryKey: ['shipments', { order_id: orderId }],
    queryFn: () => fetchShipments({ order_id: orderId }),
    enabled: !!orderId,
    refetchInterval: 30000,
  })

  return {
    shipments: shipmentsQuery.data?.data || [],
    isLoading: shipmentsQuery.isLoading,
    error: shipmentsQuery.error,
    refetch: shipmentsQuery.refetch,
  }
}
