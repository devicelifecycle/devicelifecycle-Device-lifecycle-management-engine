// ============================================================================
// ROOT LAYOUT
// ============================================================================

import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/next'
import { Outfit, Syne, Instrument_Serif, Barlow, Poppins, Source_Serif_4 } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { Toaster } from '@/components/ui/toaster'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { User } from '@/types'

const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit' })
const syne = Syne({ subsets: ['latin'], variable: '--font-syne' })
const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-instrument-serif',
})
const barlow = Barlow({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-barlow',
})
const poppins = Poppins({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-poppins',
})
const sourceSerif = Source_Serif_4({
  subsets: ['latin'],
  weight: ['400'],
  style: ['normal', 'italic'],
  variable: '--font-source-serif',
})

export const metadata: Metadata = {
  title: 'DLM Engine — Device Lifecycle Management',
  description: 'Enterprise platform for ITAD device lifecycle management',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Fetch user profile server-side so AuthProvider starts with isInitializing:false,
  // eliminating the "Loading DLM Engine" spinner even on a fresh browser with no cache.
  let initialUser: User | null | undefined = undefined
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) {
      initialUser = null
    } else {
      const { data: profile } = await supabase
        .from('users')
        .select('id, email, full_name, role, secondary_role, organization_id, is_active, created_at, updated_at, notification_email, last_login_at')
        .eq('id', session.user.id)
        .single()
      initialUser = (profile?.is_active ? profile : null) as User | null
    }
  } catch {
    // Proceed without server data — client auth handles the fallback
  }

  return (
    <html lang="en" suppressHydrationWarning className={`${outfit.variable} ${syne.variable} ${instrumentSerif.variable} ${barlow.variable} ${poppins.variable} ${sourceSerif.variable}`}>
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
        <Providers initialUser={initialUser}>
          {children}
          <Toaster />
        </Providers>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  )
}
