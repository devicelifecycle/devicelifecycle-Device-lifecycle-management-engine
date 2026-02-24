// ============================================================================
// VENDORS HOOK
// ============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Vendor } from '@/types'

interface VendorFilters {
  search?: string
  is_active?: boolean
  page?: number
  limit?: number
}

interface VendorsResponse {
  data: Vendor[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

async function fetchVendors(filters: VendorFilters): Promise<VendorsResponse> {
  const params = new URLSearchParams()
  
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      params.append(key, String(value))
    }
  })

  const response = await fetch(`/api/vendors?${params.toString()}`)
  if (!response.ok) {
    throw new Error('Failed to fetch vendors')
  }
  return response.json()
}

async function fetchVendorById(id: string): Promise<Vendor> {
  const response = await fetch(`/api/vendors/${id}`)
  if (!response.ok) {
    throw new Error('Failed to fetch vendor')
  }
  return response.json()
}

async function createVendor(data: Partial<Vendor>): Promise<Vendor> {
  const response = await fetch('/api/vendors', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    throw new Error('Failed to create vendor')
  }
  return response.json()
}

async function updateVendor(id: string, data: Partial<Vendor>): Promise<Vendor> {
  const response = await fetch(`/api/vendors/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    throw new Error('Failed to update vendor')
  }
  return response.json()
}

async function deleteVendor(id: string): Promise<void> {
  const response = await fetch(`/api/vendors/${id}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    throw new Error('Failed to delete vendor')
  }
}

export function useVendors(filters: VendorFilters = {}) {
  const queryClient = useQueryClient()

  const vendorsQuery = useQuery({
    queryKey: ['vendors', filters],
    queryFn: () => fetchVendors(filters),
  })

  const createMutation = useMutation({
    mutationFn: createVendor,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Vendor> }) =>
      updateVendor(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteVendor,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendors'] })
    },
  })

  return {
    vendors: vendorsQuery.data?.data || [],
    total: vendorsQuery.data?.total || 0,
    page: vendorsQuery.data?.page || 1,
    totalPages: vendorsQuery.data?.total_pages || 1,
    isLoading: vendorsQuery.isLoading,
    error: vendorsQuery.error,
    refetch: vendorsQuery.refetch,
    
    create: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    
    update: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    
    remove: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  }
}

export function useVendor(id: string | null) {
  const queryClient = useQueryClient()

  const vendorQuery = useQuery({
    queryKey: ['vendor', id],
    queryFn: () => (id ? fetchVendorById(id) : null),
    enabled: !!id,
  })

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Vendor>) => updateVendor(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vendor', id] })
      queryClient.invalidateQueries({ queryKey: ['vendors'] })
    },
  })

  return {
    vendor: vendorQuery.data,
    isLoading: vendorQuery.isLoading,
    error: vendorQuery.error,
    refetch: vendorQuery.refetch,
    
    update: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
  }
}
