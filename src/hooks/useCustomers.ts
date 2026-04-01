// ============================================================================
// CUSTOMERS HOOK
// ============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'
import type { Customer } from '@/types'

interface CustomerFilters {
  search?: string
  is_active?: boolean
  page?: number
  limit?: number
  organization_id?: string
  enabled?: boolean
}

interface CustomersResponse {
  data: Customer[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

async function fetchCustomers(filters: CustomerFilters): Promise<CustomersResponse> {
  const params = new URLSearchParams()
  
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      params.append(key, String(value))
    }
  })

  const response = await fetch(`/api/customers?${params.toString()}`)
  if (!response.ok) {
    throw new Error('Failed to fetch customers')
  }
  return response.json()
}

async function fetchCustomerById(id: string): Promise<Customer> {
  const response = await fetch(`/api/customers/${id}`)
  if (!response.ok) {
    throw new Error('Failed to fetch customer')
  }
  return response.json()
}

async function createCustomer(data: Partial<Customer>): Promise<Customer> {
  const response = await fetch('/api/customers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to create customer')
  }
  return response.json()
}

async function updateCustomer(id: string, data: Partial<Customer>): Promise<Customer> {
  const response = await fetch(`/api/customers/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    throw new Error('Failed to update customer')
  }
  return response.json()
}

async function deleteCustomer(id: string): Promise<void> {
  const response = await fetch(`/api/customers/${id}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    throw new Error('Failed to delete customer')
  }
}

export function useCustomers(filters: CustomerFilters = {}) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const canReadCustomers = !!user && !['customer', 'vendor'].includes(user.role)
  const { enabled = true, ...queryFilters } = filters

  const customersQuery = useQuery({
    queryKey: ['customers', queryFilters],
    queryFn: () => fetchCustomers(queryFilters),
    enabled: enabled && canReadCustomers,
  })

  const createMutation = useMutation({
    mutationFn: createCustomer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Customer> }) =>
      updateCustomer(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteCustomer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
  })

  return {
    customers: customersQuery.data?.data || [],
    total: customersQuery.data?.total || 0,
    page: customersQuery.data?.page || 1,
    totalPages: customersQuery.data?.total_pages || 1,
    isLoading: customersQuery.isLoading,
    error: customersQuery.error,
    refetch: customersQuery.refetch,
    
    create: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    
    update: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    
    remove: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  }
}

async function fetchMyCustomer(): Promise<Customer | null> {
  const response = await fetch('/api/customers/me')
  if (!response.ok) {
    if (response.status === 404) return null
    throw new Error('Failed to fetch my customer')
  }
  return response.json()
}

/**
 * Hook for customer role: returns the customer record for the current user's organization.
 * Use when creating orders — the customer doesn't need to select themselves.
 * Only fetches when user has customer role.
 */
export function useMyCustomer() {
  const { user } = useAuth()
  const isCustomer = user?.role === 'customer'
  const query = useQuery({
    queryKey: ['customers', 'me'],
    queryFn: fetchMyCustomer,
    enabled: !!isCustomer,
  })
  return {
    customer: query.data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  }
}

export function useCustomer(id: string | null) {
  const queryClient = useQueryClient()

  const customerQuery = useQuery({
    queryKey: ['customer', id],
    queryFn: () => (id ? fetchCustomerById(id) : null),
    enabled: !!id,
  })

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Customer>) => updateCustomer(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer', id] })
      queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteCustomer(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer', id] })
      queryClient.invalidateQueries({ queryKey: ['customers'] })
    },
  })

  return {
    customer: customerQuery.data,
    isLoading: customerQuery.isLoading,
    error: customerQuery.error,
    refetch: customerQuery.refetch,
    
    update: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    
    remove: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  }
}
