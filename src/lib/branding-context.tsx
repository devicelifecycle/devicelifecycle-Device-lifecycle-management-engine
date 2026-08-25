"use client"

// ============================================================================
// SHARED CLIENT BRANDING CONTEXT
// ============================================================================
// Provides resolved tenant branding to all authenticated (dashboard) client
// components without touching the auth-branding context. The provider receives
// a fully-resolved TenantBranding object from the server and exposes a stable
// subset of fields consumed across the dashboard.

import { createContext, useContext, ReactNode } from "react"
import type { TenantBranding } from "@/lib/branding"

interface BrandingContextValue {
  name: string
  logoText: string
  logoUrl: string | null
  primary: string
  secondaryColor: string
  supportPhone: string | null
  helpUrl: string | null
  supportEmail: string | null
  tagline: string
}

const BrandingContext = createContext<BrandingContextValue | null>(null)

export function BrandingProvider({
  branding,
  children,
}: {
  branding: TenantBranding
  children: ReactNode
}) {
  const value: BrandingContextValue = {
    name: branding.name,
    logoText: branding.logoText,
    logoUrl: branding.logoUrl,
    primary: branding.primary,
    secondaryColor: branding.secondaryColor ?? "221 83% 41%",
    supportPhone: branding.supportPhone ?? null,
    helpUrl: branding.helpUrl ?? null,
    supportEmail: branding.supportEmail ?? null,
    tagline: branding.tagline,
  }

  return (
    <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>
  )
}

export function useBranding(): BrandingContextValue {
  const ctx = useContext(BrandingContext)
  if (!ctx) {
    throw new Error("useBranding must be used within a BrandingProvider")
  }
  return ctx
}
