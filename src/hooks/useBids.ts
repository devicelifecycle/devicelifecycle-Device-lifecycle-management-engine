import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import type { VendorBid, Vendor, Order } from '@/types'

export interface BidWithContext extends Omit<VendorBid, 'vendor'> {
  vendor?: Pick<Vendor, 'id' | 'company_name' | 'contact_email' | 'contact_name'>
  order?: Pick<Order, 'id' | 'order_number' | 'type' | 'status' | 'total_quantity'>
}

interface BidsResponse {
  data: BidWithContext[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

interface BidFilters {
  status?: string
  page?: number
  page_size?: number
}

async function fetchBids(filters: BidFilters): Promise<BidsResponse> {
  const params = new URLSearchParams()
  if (filters.status && filters.status !== 'all') params.set('status', filters.status)
  if (filters.page) params.set('page', String(filters.page))
  if (filters.page_size) params.set('page_size', String(filters.page_size))

  const res = await fetch(`/api/vendors/bids?${params}`)
  if (!res.ok) throw new Error('Failed to fetch bids')
  return res.json()
}

async function updateBidStatus(id: string, status: 'accepted' | 'rejected', cpo_markup_percent?: number) {
  const res = await fetch(`/api/vendors/bids/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, cpo_markup_percent }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to update bid')
  }
  return res.json()
}

export function useBids(filters: BidFilters = {}) {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['bids', filters],
    queryFn: () => fetchBids(filters),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, status, cpo_markup_percent }: { id: string; status: 'accepted' | 'rejected'; cpo_markup_percent?: number }) =>
      updateBidStatus(id, status, cpo_markup_percent),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bids'] })
      queryClient.invalidateQueries({ queryKey: ['orders'] })
      queryClient.invalidateQueries({ queryKey: ['order'] })
    },
  })

  return {
    bids: query.data?.data || [],
    total: query.data?.total || 0,
    page: query.data?.page || 1,
    totalPages: query.data?.total_pages || 1,
    isLoading: query.isLoading,
    error: query.error,
    updateBid: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
  }
}
