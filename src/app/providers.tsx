// ============================================================================
// PROVIDERS
// ============================================================================

'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { useState } from 'react'
import { AuthProvider } from '@/hooks/useAuth'

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // staleTime: 0 — data is always considered stale so any window-focus
            // or remount triggers a background refetch. This is the key fix for
            // cross-device sync: a change made on device A shows on device B the
            // moment the user on device B switches back to the tab.
            staleTime: 0,
            // Keep unused cache entries for 60s so navigating back is instant
            // while still serving fresh data via background refetch.
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
        <ThemeProvider attribute="class" forcedTheme="dark" disableTransitionOnChange>
          {children}
        </ThemeProvider>
      </QueryClientProvider>
    </AuthProvider>
  )
}
