// ============================================================================
// ORGANIZATIONS HOOK
// ============================================================================

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { Organization } from '@/types'

interface OrganizationFilters {
  search?: string
  type?: string
  page?: number
  limit?: number
}

interface OrganizationsResponse {
  data: Organization[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

async function fetchOrganizations(filters: OrganizationFilters): Promise<OrganizationsResponse> {
  const params = new URLSearchParams()

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      params.append(key, String(value))
    }
  })

  const response = await fetch(`/api/organizations?${params.toString()}`)
  if (!response.ok) {
    throw new Error('Failed to fetch organizations')
  }
  return response.json()
}

async function fetchOrganizationById(id: string): Promise<Organization> {
  const response = await fetch(`/api/organizations/${id}`)
  if (!response.ok) {
    throw new Error('Failed to fetch organization')
  }
  return response.json()
}

async function createOrganization(data: Partial<Organization>): Promise<Organization> {
  const response = await fetch('/api/organizations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    throw new Error('Failed to create organization')
  }
  return response.json()
}

async function updateOrganization(id: string, data: Partial<Organization>): Promise<Organization> {
  const response = await fetch(`/api/organizations/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!response.ok) {
    throw new Error('Failed to update organization')
  }
  return response.json()
}

export function useOrganizations(filters: OrganizationFilters = {}) {
  const queryClient = useQueryClient()

  const organizationsQuery = useQuery({
    queryKey: ['organizations', filters],
    queryFn: () => fetchOrganizations(filters),
  })

  const createMutation = useMutation({
    mutationFn: createOrganization,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Organization> }) =>
      updateOrganization(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] })
    },
  })

  return {
    organizations: organizationsQuery.data?.data || [],
    total: organizationsQuery.data?.total || 0,
    page: organizationsQuery.data?.page || 1,
    totalPages: organizationsQuery.data?.total_pages || 1,
    isLoading: organizationsQuery.isLoading,
    error: organizationsQuery.error,
    refetch: organizationsQuery.refetch,

    create: createMutation.mutateAsync,
    isCreating: createMutation.isPending,

    update: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
  }
}

export function useOrganization(id: string | null) {
  const queryClient = useQueryClient()

  const organizationQuery = useQuery({
    queryKey: ['organization', id],
    queryFn: () => (id ? fetchOrganizationById(id) : null),
    enabled: !!id,
  })

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Organization>) => updateOrganization(id!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization', id] })
      queryClient.invalidateQueries({ queryKey: ['organizations'] })
    },
  })

  return {
    organization: organizationQuery.data,
    isLoading: organizationQuery.isLoading,
    error: organizationQuery.error,
    refetch: organizationQuery.refetch,

    update: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
  }
}
