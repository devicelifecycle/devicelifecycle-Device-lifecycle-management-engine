// ============================================================================
// PROVIDERS
// ============================================================================

'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ThemeProvider } from 'next-themes'
import { useState } from 'react'
import { AuthProvider, useAuth } from '@/hooks/useAuth'
import { useRealtimeSync } from '@/hooks/useRealtimeSync'
import { BrandingProvider } from '@/lib/branding-context'
import { DEFAULT_BRANDING, type TenantBranding } from '@/lib/branding'
import type { User } from '@/types'

// Inner component so useRealtimeSync can access the QueryClient context
function RealtimeSyncProvider({ children }: { children: React.ReactNode }) {
  useRealtimeSync()
  return <>{children}</>
}

function ConditionalRealtimeProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) return <>{children}</>
  return <RealtimeSyncProvider>{children}</RealtimeSyncProvider>
}

export function Providers({
  children,
  initialUser,
  initialBranding,
}: {
  children: React.ReactNode
  initialUser?: User | null
  initialBranding?: TenantBranding
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            gcTime: 5 * 60 * 1000,
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
            refetchOnMount: false,
            retry: 1,
          },
        },
      })
  )

  return (
    <AuthProvider initialUser={initialUser}>
      <QueryClientProvider client={queryClient}>
        <ConditionalRealtimeProvider>
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
            <BrandingProvider branding={initialBranding ?? DEFAULT_BRANDING}>
              {children}
            </BrandingProvider>
          </ThemeProvider>
        </ConditionalRealtimeProvider>
      </QueryClientProvider>
    </AuthProvider>
  )
}
