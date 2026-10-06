// ============================================================================
// ROOT LAYOUT
// ============================================================================

import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { PT_Sans } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { Toaster } from '@/components/ui/toaster'
import { cookies } from 'next/headers'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getServerTenant } from '@/lib/tenant-context'
import { tenantBrandingStyle } from '@/lib/branding'
import type { User } from '@/types'

// PT Sans across the whole platform, matching gorecell.ca — their theme CSS
// (dstheme/assets/styles.min.css + new.css) uses `PT Sans` in ~200 of its
// font-family declarations and loads it from Google Fonts at 400/700 with
// italics. This replaces the six-family stack that was here before (Outfit,
// Syne, Instrument Serif, Barlow, Poppins, Source Serif 4).
//
// PT Sans ships only 400 and 700. Tailwind's font-medium (500) and
// font-semibold (600) therefore resolve by CSS font matching to 400 and 700
// respectively — no synthetic weights, and the same two-weight rhythm the
// reference site has. Every family below points at the one face so nothing
// can silently fall back to a system font.
const ptSans = PT_Sans({
  subsets: ['latin'],
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  display: 'swap',
  variable: '--font-pt-sans',
})

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getServerTenant()
  const name = tenant.branding.name
  return {
    title: `${name} — Device Lifecycle Management Platform`,
    description: 'Enterprise platform for ITAD device lifecycle management',
  }
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Fetch user profile server-side so AuthProvider starts with isInitializing:false,
  // eliminating the "Loading Byte-Back" spinner even on a fresh browser with no cache.
  // Fast path: if dlm_profile cookie is present and matches the session, skip the DB query.
  let initialUser: User | null | undefined = undefined
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      initialUser = null
    } else {
      // Try profile cookie first — avoids a DB round-trip on repeat page loads
      const cookieStore = await cookies()
      const profileCookie = cookieStore.get('dlm_profile')
      if (profileCookie) {
        try {
          const parsed = JSON.parse(decodeURIComponent(profileCookie.value)) as Partial<User>
          if (parsed.id === session.user.id && parsed.is_active) {
            initialUser = parsed as User
          }
        } catch {}
      }
      // Fallback to DB if no valid cookie
      if (initialUser === undefined) {
        const { data: profile } = await supabase
          .from('users')
          .select('id, email, full_name, role, secondary_role, organization_id, is_active, is_org_admin, onboarding_completed_at, created_at, updated_at, notification_email, last_login_at')
          .eq('id', session.user.id)
          .single()
        initialUser = (profile?.is_active ? profile : null) as User | null
      }
    }
  } catch {
    // Proceed without server data — client auth handles the fallback
  }

  // Per-request tenant → white-label brand tokens. Platform host resolves with
  // no DB call and yields null here, so the base theme renders unchanged.
  const tenant = await getServerTenant()
  const brandStyle = tenantBrandingStyle(tenant.branding)

  return (
    <html lang="en" suppressHydrationWarning className={ptSans.variable}>
      <head>
        {/* Preconnect to Supabase so auth + DB calls skip the TLS handshake on first use */}
        {(() => {
          const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
          const origin = url.startsWith('https://') ? url.replace(/\/+$/, '').split('/').slice(0, 3).join('/') : ''
          if (!origin || origin.includes('placeholder')) return null
          return (
            <>
              <link rel="preconnect" href={origin} />
              <link rel="dns-prefetch" href={origin} />
            </>
          )
        })()}
        {/* White-label brand tokens for a VAR host. Absent for the platform host. */}
        {brandStyle && <style dangerouslySetInnerHTML={{ __html: brandStyle }} />}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                // Suppress AbortError from Supabase auth-js navigator.locks (harmless; React Strict Mode / tab close)
                function isAbortRelated(r) {
                  if (!r) return false;
                  if (r.name === 'AbortError') return true;
                  var msg = (r && (r.message || r.reason)) ? String(r.message || r.reason) : '';
                  if (/aborted|signal is aborted/i.test(msg)) return true;
                  var stack = (r && (r.stack || (r.error && r.error.stack))) ? String(r.stack || r.error.stack) : '';
                  if (/locks\\.js|navigator\\.locks|auth-js/i.test(stack)) return true;
                  return false;
                }
                window.addEventListener('unhandledrejection', function(e) {
                  if (isAbortRelated(e.reason)) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                  }
                }, true);
                window.addEventListener('error', function(e) {
                  if (isAbortRelated({ message: e.message, stack: e.error && e.error.stack })) {
                    e.preventDefault();
                    e.stopPropagation();
                    return true;
                  }
                }, true);
              })();
            `,
          }}
        />
      </head>
      <body className="font-sans antialiased text-foreground">
        <Providers initialUser={initialUser} initialBranding={tenant.branding}>
          {children}
          <Toaster />
        </Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
