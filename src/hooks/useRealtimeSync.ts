// ============================================================================
// REALTIME SYNC HOOK
// ============================================================================
// Single Supabase Realtime channel that listens to all key DB tables and:
// 1. Invalidates matching React Query cache entries (for hooks using useQuery)
// 2. Fires a custom DOM event 'dlm:db-change' so plain-fetch pages can also
//    refetch without needing React Query (e.g. triage page, admin pages).
//
// Every open browser tab / device sees updates the moment a DB row changes.

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
  users:            [['users']],
  shipments:        [['shipments']],
  competitor_prices:[['competitor_prices'], ['pricing']],
  notifications:    [['notifications']],
}

const supabase = createBrowserSupabaseClient()

/** Dispatch a custom DOM event so non-React-Query pages can subscribe */
function notifyTable(table: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('dlm:db-change', { detail: { table } }))
}

export function useRealtimeSync() {
  const queryClient = useQueryClient()

  useEffect(() => {
    const channel = supabase.channel('dlm-realtime-sync')

    for (const table of Object.keys(TABLE_KEY_MAP)) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          // 1. Invalidate React Query cache
          const keys = TABLE_KEY_MAP[table] ?? []
          for (const key of keys) {
            queryClient.invalidateQueries({ queryKey: key })
          }
          // 2. Fire DOM event for plain-fetch pages
          notifyTable(table)
        }
      )
    }

    channel.subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [queryClient])
}
