// ============================================================================
// DEVICES HOOK
// ============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Device, DeviceCategory } from '@/types'

interface DeviceFilters {
  search?: string
  category?: DeviceCategory
  make?: string
  page?: number
  limit?: number
}

interface DevicesResponse {
  data: Device[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

async function fetchDevices(filters: DeviceFilters): Promise<DevicesResponse> {
  const params = new URLSearchParams()

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      params.append(key, String(value))
    }
  })

  const response = await fetch(`/api/devices?${params.toString()}`)
  if (!response.ok) {
    throw new Error('Failed to fetch devices')
  }
  return response.json()
}

async function fetchDeviceById(id: string): Promise<Device> {
  const response = await fetch(`/api/devices/${id}`)
  if (!response.ok) {
    throw new Error('Failed to fetch device')
  }
  return response.json()
}

async function createDevice(data: Partial<Device>): Promise<Device> {
  const response = await fetch('/api/devices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    throw new Error('Failed to create device')
  }
  return response.json()
}

async function updateDevice(id: string, data: Partial<Device>): Promise<Device> {
  const response = await fetch(`/api/devices/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    throw new Error('Failed to update device')
  }
  return response.json()
}

async function deleteDevice(id: string): Promise<void> {
  const response = await fetch(`/api/devices/${id}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    throw new Error('Failed to delete device')
  }
}

export function useDevices(filters: DeviceFilters = {}) {
  const queryClient = useQueryClient()

  const devicesQuery = useQuery({
    queryKey: ['devices', filters],
    queryFn: () => fetchDevices(filters),
  })

  const createMutation = useMutation({
    mutationFn: createDevice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Device> }) =>
      updateDevice(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteDevice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] })
    },
  })

  return {
    devices: devicesQuery.data?.data || [],
    total: devicesQuery.data?.total || 0,
    page: devicesQuery.data?.page || 1,
    totalPages: devicesQuery.data?.total_pages || 1,
    isLoading: devicesQuery.isLoading,
    error: devicesQuery.error,
    refetch: devicesQuery.refetch,

    create: createMutation.mutateAsync,
    isCreating: createMutation.isPending,

    update: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,

    remove: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  }
}

export function useDevice(id: string | null) {
  const queryClient = useQueryClient()

  const deviceQuery = useQuery({
    queryKey: ['device', id],
    queryFn: () => (id ? fetchDeviceById(id) : null),
    enabled: !!id,
  })

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Device>) => updateDevice(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device', id] })
      queryClient.invalidateQueries({ queryKey: ['devices'] })
    },
  })

  return {
    device: deviceQuery.data,
    isLoading: deviceQuery.isLoading,
    error: deviceQuery.error,
    refetch: deviceQuery.refetch,

    update: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
  }
}
