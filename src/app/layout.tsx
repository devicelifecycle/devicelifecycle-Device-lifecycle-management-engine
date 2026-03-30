// ============================================================================
// ROOT LAYOUT
// ============================================================================

import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/react'
import { Outfit, Syne } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { Toaster } from '@/components/ui/toaster'

const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit' })
const syne = Syne({ subsets: ['latin'], variable: '--font-syne' })

export const metadata: Metadata = {
  title: 'DLM Engine — Device Lifecycle Management',
  description: 'Enterprise platform for ITAD device lifecycle management',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning className={`${outfit.variable} ${syne.variable}`}>
      <head>
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
        <Providers>
          {children}
          <Toaster />
        </Providers>
        <Analytics />
      </body>
    </html>
  )
}
