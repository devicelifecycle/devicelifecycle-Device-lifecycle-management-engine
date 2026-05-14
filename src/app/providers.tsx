// ============================================================================
// PROVIDERS
// ============================================================================

'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { useState } from 'react'
import { AuthProvider } from '@/hooks/useAuth'
import { useRealtimeSync } from '@/hooks/useRealtimeSync'

// Inner component so useRealtimeSync can access the QueryClient context
function RealtimeSyncProvider({ children }: { children: React.ReactNode }) {
  useRealtimeSync()
  return <>{children}</>
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 30s default staleTime — prevents spinner on remount when navigating
            // between pages. Supabase Realtime subscriptions push invalidations for
            // live data so a tight polling interval isn't needed here.
            staleTime: 30 * 1000,
            // Keep cache 5min so navigating back shows cached data instantly.
            gcTime: 5 * 60 * 1000,
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
            refetchOnMount: true,
            retry: 1,
          },
        },
      })
  )

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClient}>
        <RealtimeSyncProvider>
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
            {children}
          </ThemeProvider>
        </RealtimeSyncProvider>
      </QueryClientProvider>
    </AuthProvider>
  )
}
