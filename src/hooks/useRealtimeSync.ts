// ============================================================================
// REALTIME SYNC HOOK
// ============================================================================
// Single Supabase Realtime channel that listens to all key DB tables and:
// 1. Invalidates matching React Query cache entries (for hooks using useQuery)
// 2. Fires a custom DOM event 'dlm:db-change' so plain-fetch pages can also
//    refetch without needing React Query (e.g. triage page, admin pages).
//
// Every open browser tab / device sees updates the moment a DB row changes.

import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'

// Map: DB table → React Query keys to invalidate on any change
const TABLE_KEY_MAP: Record<string, string[][]> = {
  orders:           [['orders'], ['order'], ['customer-dashboard'], ['vendor-open-orders'], ['vendor-my-bids']],
  order_items:      [['orders'], ['order'], ['customer-dashboard'], ['vendor-open-orders']],
  order_timeline:   [['orders'], ['order']],
  order_exceptions: [['orders'], ['order'], ['exceptions'], ['order-discrepancies']],
  imei_records:     [['imei_records'], ['triage']],
  triage_results:   [['triage_results'], ['triage']],
  device_catalog:   [['devices'], ['device']],
  customers:        [['customers'], ['customer'], ['customer-dashboard']],
  vendors:          [['vendors'], ['vendor'], ['vendor-open-orders'], ['vendor-my-bids']],
  users:            [['users']],
  shipments:        [['shipments'], ['orders'], ['order']],
  vendor_bids:      [['bids'], ['vendor-my-bids'], ['vendor-open-orders'], ['orders'], ['order']],
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
  // Ref keeps the latest queryClient accessible inside the effect without
  // it being a dependency — prevents re-subscribe on queryClient identity change
  const queryClientRef = useRef(queryClient)
  queryClientRef.current = queryClient

  useEffect(() => {
    const channel = supabase.channel('dlm-realtime-sync')

    // Coalesce bursts: bulk operations (CSV upload, bulk-transition) fire dozens
    // of row-change events in quick succession. Without batching, each one would
    // invalidate queries and trigger a refetch in every open tab — a refetch storm.
    // We collect the changed tables and flush once on a trailing 250ms timer, so a
    // burst produces a single invalidation pass. A single change is delayed 250ms,
    // which is imperceptible; correctness is unchanged (data still refreshes).
    const pendingTables = new Set<string>()
    let flushTimer: ReturnType<typeof setTimeout> | null = null

    const flush = () => {
      flushTimer = null
      for (const table of pendingTables) {
        for (const key of TABLE_KEY_MAP[table] ?? []) {
          queryClientRef.current.invalidateQueries({ queryKey: key })
        }
        notifyTable(table)
      }
      pendingTables.clear()
    }

    for (const table of Object.keys(TABLE_KEY_MAP)) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          pendingTables.add(table)
          if (!flushTimer) flushTimer = setTimeout(flush, 250)
        }
      )
    }

    channel.subscribe()

    return () => {
      if (flushTimer) clearTimeout(flushTimer)
      supabase.removeChannel(channel)
    }
  }, []) // Empty deps — subscribe once on mount, never re-subscribe
}
