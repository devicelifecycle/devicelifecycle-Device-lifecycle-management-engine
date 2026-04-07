// ============================================================================
// REALTIME SYNC HOOK
// ============================================================================
// Single Supabase Realtime channel that listens to all key DB tables and
// invalidates the matching React Query cache entries the moment a row
// changes — so every open device/browser sees updates instantly without
// polling or manual refresh.

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'

// Map: DB table → React Query keys to invalidate on any change
const TABLE_KEY_MAP: Record<string, string[][]> = {
  orders:           [['orders'], ['order']],
  order_items:      [['orders'], ['order']],
  order_timeline:   [['orders'], ['order']],
  order_exceptions: [['orders'], ['order'], ['exceptions'], ['order-discrepancies']],
  imei_records:     [['imei_records'], ['triage']],
  triage_results:   [['triage_results'], ['triage']],
  device_catalog:   [['devices'], ['device']],
  customers:        [['customers'], ['customer']],
  vendors:          [['vendors'], ['vendor']],
  shipments:        [['shipments']],
  competitor_prices:[['competitor_prices'], ['pricing']],
  notifications:    [['notifications']],
}

const supabase = createBrowserSupabaseClient()

export function useRealtimeSync() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const channel = supabase.channel('dlm-realtime-sync')

    for (const table of Object.keys(TABLE_KEY_MAP)) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          const keys = TABLE_KEY_MAP[table] ?? []
          for (const key of keys) {
            queryClient.invalidateQueries({ queryKey: key })
          }
        }
      )
    }

    channel.subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])
}
