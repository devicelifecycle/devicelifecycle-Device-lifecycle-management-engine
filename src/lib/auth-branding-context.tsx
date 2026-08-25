"use client"

// ============================================================================
// AUTH BRANDING CONTEXT
// ============================================================================
// Provides tenant branding to client components in the auth flow (login,
// registration, password reset). The provider receives a fully-resolved
// TenantBranding object from the server and exposes a subset of fields that
// auth pages actually consume. This keeps the auth bundle small and avoids
// pulling in the full branding resolution logic client-side.

import { createContext, useContext, ReactNode } from "react"
import type { TenantBranding } from "@/lib/branding"

/**
 * Subset of TenantBranding used by auth pages.
 * Omits sidebar/theme tokens and supportEmail (handled server-side in emails).
 */
interface TenantBrandingContextValue {
  name: string
  logoText: string
  logoUrl: string | null
  primary: string
  secondaryColor: string
  supportPhone: string | null
  helpUrl: string | null
  tagline: string
}

const AuthBrandingContext = createContext<TenantBrandingContextValue | null>(null)

interface AuthBrandingProviderProps {
  /** Resolved tenant branding from the server. */
  branding: TenantBranding
  children: ReactNode
}

/**
 * AuthBrandingProvider wraps auth pages and supplies branding via context.
 * The branding prop is the fully-resolved TenantBranding object from the server.
 */
export function AuthBrandingProvider({
  branding,
  children,
}: AuthBrandingProviderProps) {
  const value: TenantBrandingContextValue = {
    name: branding.name,
    logoText: branding.logoText,
    logoUrl: branding.logoUrl,
    primary: branding.primary,
    secondaryColor: branding.secondaryColor ?? "221 83% 41%",
    supportPhone: branding.supportPhone ?? null,
    helpUrl: branding.helpUrl ?? null,
    tagline: branding.tagline,
  }

  return (
    <AuthBrandingContext.Provider value={value}>
      {children}
    </AuthBrandingContext.Provider>
  )
}

/**
 * Hook to access tenant branding in auth client components.
 * Throws if used outside AuthBrandingProvider.
 */
export function useAuthBranding(): TenantBrandingContextValue {
  const ctx = useContext(AuthBrandingContext)
  if (!ctx) {
    throw new Error(
      "useAuthBranding must be used within an AuthBrandingProvider"
    )
  }
  return ctx
}