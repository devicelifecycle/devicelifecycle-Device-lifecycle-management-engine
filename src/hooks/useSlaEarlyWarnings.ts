import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/hooks/useAuth'

export interface SlaEarlyWarning {
  order_id: string
  order_number: string
  status: string
  order_type: string
  hours_in_status: number
  baseline_avg_hours: number
  pace_ratio: number
}

interface SlaEarlyWarningsResponse {
  baselines: Array<{ status: string; order_type: string; sample_size: number; avg_hours: number }>
  warnings: SlaEarlyWarning[]
}

export function useSlaEarlyWarnings() {
  const { user } = useAuth()
  const enabled = !!user && ['admin', 'coe_manager'].includes(user.role)

  return useQuery<SlaEarlyWarningsResponse>({
    queryKey: ['sla-early-warnings'],
    queryFn: async () => {
      const res = await fetch('/api/admin/sla-predictions')
      if (!res.ok) throw new Error('Failed to fetch SLA early warnings')
      return res.json()
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  })
}
