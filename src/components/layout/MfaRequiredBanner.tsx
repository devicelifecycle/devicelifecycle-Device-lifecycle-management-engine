'use client'

// ============================================================================
// MFA REQUIRED BANNER
// ============================================================================
//
// Companion to the server gate in requireAuth(). When a tenant sets
// branding.requireMfa, every API route answers 403 { code: 'mfa_required' }
// until the session reaches aal2. Without this banner the dashboard would just
// look broken — every panel empty, no explanation — so it states the reason and
// points at /profile, the one page that can clear the block.
//
// The check mirrors the server's exactly (assurance level, not "has a factor"),
// so a user who enrolled but signed in without completing the challenge is told
// to re-authenticate rather than being shown a page that says they're fine.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ShieldAlert } from 'lucide-react'
import { createBrowserSupabaseClient } from '@/lib/supabase/client'
import { useBranding } from '@/lib/branding-context'

// Module-level singleton — a new client per render would re-init auth storage.
const supabase = createBrowserSupabaseClient()

export function MfaRequiredBanner() {
  const branding = useBranding()
  const pathname = usePathname()
  const [blocked, setBlocked] = useState(false)

  useEffect(() => {
    if (!branding.requireMfa) {
      setBlocked(false)
      return
    }
    let cancelled = false
    const check = () => {
      supabase.auth.mfa
        .getAuthenticatorAssuranceLevel()
        .then((res: { data: { currentLevel: string | null } | null }) => {
          if (!cancelled) setBlocked(res.data?.currentLevel !== 'aal2')
        })
        .catch(() => {
          // Never let a transient auth read paint a scary banner over a working app.
          if (!cancelled) setBlocked(false)
        })
    }
    check()
    // Enrolling on /profile verifies a challenge, which issues a fresh aal2
    // token in place. Re-checking on that token change clears the banner
    // immediately instead of leaving it up until the next navigation.
    const { data: sub } = supabase.auth.onAuthStateChange(() => check())
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
    // pathname: also re-check after the user enrols and navigates away.
  }, [branding.requireMfa, pathname])

  if (!blocked) return null

  const onProfile = pathname === '/profile'

  return (
    <div className="relative z-[60] flex items-center gap-3 border-b border-red-400/30 bg-red-500/15 px-4 py-2 text-red-100 backdrop-blur">
      <ShieldAlert className="h-4 w-4 shrink-0" />
      <p className="flex-1 font-body text-[13px]">
        <span className="font-semibold">Two-factor authentication is required.</span>{' '}
        {branding.name || 'Your organization'} requires a second factor. Until you set one up and
        sign in with it, the rest of this workspace will not load data.
      </p>
      {!onProfile && (
        <Link
          href="/profile"
          className="shrink-0 rounded-lg bg-red-500/20 px-3 py-1.5 text-[12px] font-semibold text-red-50 transition-colors hover:bg-red-500/30"
        >
          Set up now
        </Link>
      )}
    </div>
  )
}
