import { useQuery } from '@tanstack/react-query'

export interface DashboardCounts {
  pendingBids?: number
  actionableOrders?: number
}

async function fetchCounts(): Promise<DashboardCounts> {
  try {
    const res = await fetch('/api/dashboard/counts')
    if (!res.ok) return {}
    const json = await res.json()
    return json.counts ?? {}
  } catch {
    return {}
  }
}

export function useDashboardCounts() {
  const { data } = useQuery({
    queryKey: ['dashboard-counts'],
    queryFn: fetchCounts,
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
  return data ?? {}
}
