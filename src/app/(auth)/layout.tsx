// ============================================================================
// AUTH LAYOUT
// ============================================================================

import { getServerTenant } from '@/lib/tenant-context'
import { AuthBrandingProvider } from '@/lib/auth-branding-context'

export default async function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const tenant = await getServerTenant()

  return (
    <AuthBrandingProvider branding={tenant.branding}>
      {children}
    </AuthBrandingProvider>
  )
}
