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
            // staleTime: 0 — data is always stale so window-focus and remounts
            // always trigger a background refetch. Combined with Realtime
            // invalidation, every open browser sees changes instantly.
            staleTime: 0,
            // Keep cache 60s so navigating back is instant.
            gcTime: 60 * 1000,
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
          <ThemeProvider attribute="class" forcedTheme="dark" disableTransitionOnChange>
            {children}
          </ThemeProvider>
        </RealtimeSyncProvider>
      </QueryClientProvider>
    </AuthProvider>
  )
}
