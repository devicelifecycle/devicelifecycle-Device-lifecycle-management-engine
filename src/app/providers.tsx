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
            staleTime: 20 * 1000, // keep data fresh during active operations
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
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
