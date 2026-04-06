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
            // Consider data stale after 5s so background refetches keep all
            // devices in sync without hammering the server on every render.
            staleTime: 5 * 1000,
            // Always refetch when the user switches back to the tab or
            // reconnects so a colleague's update is visible immediately.
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
            // Retry once on error before showing a failure state.
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
