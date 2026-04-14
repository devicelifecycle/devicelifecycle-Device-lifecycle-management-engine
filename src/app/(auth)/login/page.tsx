'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Menu,
  Package,
  Sparkles,
} from 'lucide-react'
import { getDefaultAppPathForRole } from '@/lib/auth-routing'
import { useAuth } from '@/hooks/useAuth'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

const HERO_VIDEO =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260315_073750_51473149-4350-4920-ae24-c8214286f323.mp4'

const FEATURE_PILLS = ['Trade-In Processing', 'AI Pricing Engine', 'COE Operations']

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [sessionExpired, setSessionExpired] = useState(false)
  const [mfaStep, setMfaStep] = useState(false)
  const [mfaFactorId, setMfaFactorId] = useState('')
  const [mfaCode, setMfaCode] = useState('')
  const { login, isLoading, isAuthenticated, isInitializing, user, verifyMfa } = useAuth()
  const [isNavigating, setIsNavigating] = useState(false)
  const loginHandledNavRef = useRef(false)

  useEffect(() => {
    if (searchParams.get('reason') === 'session_expired') setSessionExpired(true)
  }, [searchParams])

  useEffect(() => {
    router.prefetch('/dashboard')
    router.prefetch('/customer/orders')
    router.prefetch('/vendor/orders')
  }, [router])

  useEffect(() => {
    if (!isInitializing && isAuthenticated) {
      setIsNavigating(true)
      if (loginHandledNavRef.current) {
        loginHandledNavRef.current = false
        return
      }
      const redirect = searchParams.get('redirect')
      const dest =
        redirect && redirect.startsWith('/') ? redirect : user ? getDefaultAppPathForRole(user.role) : '/'
      router.replace(dest)
    }
  }, [isAuthenticated, isInitializing, user, searchParams, router])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await login(email, password)
      loginHandledNavRef.current = true
    } catch (err: unknown) {
      const e = err as { type?: string; factorId?: string } & Error
      if (e?.type === 'MFA_REQUIRED' && e.factorId) {
        setMfaFactorId(e.factorId)
        setMfaStep(true)
        return
      }
      const msg = e instanceof Error ? e.message : 'Failed to sign in'
      setError(
        msg.toLowerCase().includes('invalid login') || msg.toLowerCase().includes('invalid email')
          ? 'Invalid Login ID or password.'
          : msg
      )
    }
  }

  async function handleMfaSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      await verifyMfa(mfaFactorId, mfaCode)
      loginHandledNavRef.current = true
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid code'
      setError(
        msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('expired')
          ? 'Invalid or expired code. Please try again.'
          : msg
      )
    }
  }

  return (
    // Force dark glass treatment over the video background
    <div className="dark relative min-h-screen overflow-hidden bg-black font-display">

      {/* ── Video background ───────────────────────────────────────────────── */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 h-full w-full object-cover z-0"
        src={HERO_VIDEO}
      />
      {/* Subtle darkening overlay */}
      <div className="absolute inset-0 z-0 bg-black/35" />

      {/* Loading overlay */}
      {(isLoading || isNavigating) && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/70 backdrop-blur-sm">
          <Loader2 className="h-8 w-8 animate-spin text-white" />
          <p className="font-display text-sm text-white/60">Signing in…</p>
        </div>
      )}

      {/* ── Two-panel layout ──────────────────────────────────────────────── */}
      <div className="relative z-10 flex min-h-screen">

        {/* ── LEFT PANEL — branding (desktop only) ──────────────────────── */}
        <div className="relative hidden w-[52%] flex-col p-6 lg:flex">
          {/* Glass overlay panel */}
          <div className="liquid-glass-strong pointer-events-none absolute inset-6 rounded-3xl" />

          {/* Content sits above the glass */}
          <div className="relative z-10 flex h-full flex-col">

            {/* Nav */}
            <nav className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/10">
                  <Package className="h-4 w-4 text-white" />
                </div>
                <span className="font-display text-xl font-semibold tracking-tighter text-white">
                  DLM Engine
                </span>
              </div>
              <button className="liquid-glass flex items-center gap-2 rounded-full px-3.5 py-2 text-xs font-medium text-white/80 transition-transform hover:scale-105">
                <Menu className="h-3.5 w-3.5" />
                Menu
              </button>
            </nav>

            {/* Hero — vertically centered */}
            <div className="flex flex-1 flex-col items-center justify-center gap-8 py-12">
              {/* Icon */}
              <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-white/10">
                <Package className="h-10 w-10 text-white" />
              </div>

              {/* Headline */}
              <div className="text-center">
                <h1 className="font-display text-6xl font-medium leading-[0.95] tracking-[-0.05em] text-white lg:text-7xl">
                  Operational Command<br />
                  <span className="font-serif italic text-white/75">
                    for Device Lifecycle
                  </span>
                </h1>
              </div>

              {/* CTA pill */}
              <button className="liquid-glass-strong flex items-center gap-3 rounded-full px-5 py-3 text-sm font-medium text-white transition-transform hover:scale-105 active:scale-95">
                Enterprise ITAD Platform
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/15">
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </button>

              {/* Feature pills */}
              <div className="flex flex-wrap justify-center gap-2">
                {FEATURE_PILLS.map((pill) => (
                  <span
                    key={pill}
                    className="liquid-glass rounded-full px-4 py-1.5 text-xs font-medium text-white/80 transition-transform hover:scale-105"
                  >
                    {pill}
                  </span>
                ))}
              </div>
            </div>

            {/* Bottom quote */}
            <div className="flex flex-col items-center gap-3 pb-4 text-center">
              <p className="font-display text-[10px] font-medium uppercase tracking-[0.2em] text-white/40">
                Lifecycle Management
              </p>
              <p className="font-display text-sm font-medium text-white/70">
                &ldquo;Built for the complexity of{' '}
                <span className="font-serif italic text-white/50">real operations.</span>&rdquo;
              </p>
              <div className="flex items-center gap-3">
                <div className="h-px w-12 bg-white/20" />
                <span className="font-display text-[10px] uppercase tracking-widest text-white/40">
                  DLM Engine Platform
                </span>
                <div className="h-px w-12 bg-white/20" />
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL — login form (always visible) ─────────────────── */}
        <div className="flex flex-1 flex-col items-center justify-center p-5 lg:w-[48%] lg:p-8">

          {/* Right panel top bar (desktop) */}
          <div className="mb-6 hidden w-full max-w-sm items-center justify-between lg:flex">
            <div className="liquid-glass flex items-center gap-2 rounded-full px-3 py-1.5">
              <Link href="#" className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/70 transition-colors hover:text-white">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.74l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              </Link>
              <Link href="#" className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/70 transition-colors hover:text-white">
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
              </Link>
              <ArrowRight className="ml-1 h-3.5 w-3.5 text-white/40" />
            </div>
            <button className="liquid-glass flex h-8 w-8 items-center justify-center rounded-full text-white/70 transition-transform hover:scale-105 hover:text-white">
              <Sparkles className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Mobile logo */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10">
              <Package className="h-5 w-5 text-white" />
            </div>
            <span className="font-display text-xl font-semibold tracking-tighter text-white">DLM Engine</span>
          </div>

          {/* ── Form card ────────────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="liquid-glass-strong w-full max-w-sm rounded-3xl p-8"
          >
            {/* Card header */}
            <div className="mb-6 space-y-1">
              <p className="font-display text-[10px] font-medium uppercase tracking-[0.2em] text-white/40">
                {mfaStep ? 'Two-Factor Auth' : 'Secure Access'}
              </p>
              <h2 className="font-display text-2xl font-medium text-white">
                {mfaStep ? (
                  'Verify your identity'
                ) : (
                  <>Welcome <span className="font-serif italic text-white/60">back</span></>
                )}
              </h2>
              <p className="font-display text-sm text-white/50">
                {mfaStep
                  ? 'Enter the 6-digit code from your authenticator app.'
                  : 'Use your login ID or email to enter the platform.'}
              </p>
            </div>

            {/* Alerts */}
            {sessionExpired && (
              <div className="liquid-glass mb-5 rounded-2xl px-4 py-3 text-sm text-white/80">
                Your session expired. Please sign in again.
              </div>
            )}
            {error && (
              <div className="liquid-glass mb-5 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-white/80">
                {error}
              </div>
            )}

            {/* MFA form */}
            {mfaStep ? (
              <form onSubmit={handleMfaSubmit} className="space-y-5">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-3.5 w-3.5 text-white/40" />
                    <label className="font-display text-xs font-medium text-white/60">
                      Authenticator Code
                    </label>
                  </div>
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    autoComplete="one-time-code"
                    required
                    className="border-white/10 bg-white/5 text-center font-display text-xl tracking-[0.4em] text-white placeholder:text-white/20 focus:border-white/25 focus:ring-white/10"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading || mfaCode.length !== 6}
                  className="liquid-glass-strong flex w-full items-center justify-center gap-2 rounded-full py-3 font-display text-sm font-medium text-white transition-transform hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                >
                  {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isLoading ? 'Verifying…' : 'Verify Code'}
                </button>
                <button
                  type="button"
                  onClick={() => { setMfaStep(false); setMfaCode(''); setError('') }}
                  className="w-full font-display text-xs text-white/40 transition-colors hover:text-white/70"
                >
                  ← Back to sign in
                </button>
              </form>
            ) : (
              /* Login form */
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="font-display text-xs font-medium text-white/50">
                    Login ID or Email
                  </label>
                  <Input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your login ID"
                    autoComplete="username"
                    required
                    className="border-white/10 bg-white/5 font-display text-white placeholder:text-white/20 focus:border-white/25 focus:ring-white/10"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="font-display text-xs font-medium text-white/50">Password</label>
                    <Link
                      href="/forgot-password"
                      className="font-display text-xs text-white/40 transition-colors hover:text-white/70"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      required
                      className="border-white/10 bg-white/5 font-display text-white placeholder:text-white/20 focus:border-white/25 focus:ring-white/10 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70 transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="liquid-glass-strong mt-2 flex w-full items-center justify-center gap-2 rounded-full py-3 font-display text-sm font-medium text-white transition-transform hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                >
                  {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isLoading ? 'Signing in…' : 'Sign In'}
                  {!isLoading && (
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15">
                      <ArrowRight className="h-3 w-3" />
                    </span>
                  )}
                </button>

                <p className="pt-1 text-center font-display text-xs text-white/40">
                  Need an account?{' '}
                  <Link href="/register" className="text-white/70 underline-offset-4 hover:underline hover:text-white transition-colors">
                    Request access
                  </Link>
                </p>
              </form>
            )}
          </motion.div>

          {/* Bottom feature cards (desktop) */}
          <div className="mt-6 hidden w-full max-w-sm lg:block">
            <div className="liquid-glass rounded-[2rem] p-3">
              <div className="grid grid-cols-2 gap-2 mb-2">
                {[
                  { label: 'Triage & Grading', icon: '⚙' },
                  { label: 'Market Pricing', icon: '📈' },
                ].map((item) => (
                  <div key={item.label} className="liquid-glass rounded-2xl px-4 py-3 transition-transform hover:scale-105">
                    <span className="text-lg">{item.icon}</span>
                    <p className="mt-1.5 font-display text-xs font-medium text-white/70">{item.label}</p>
                  </div>
                ))}
              </div>
              <div className="liquid-glass flex items-center gap-3 rounded-2xl px-4 py-3 transition-transform hover:scale-105">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-lg">📦</div>
                <div className="min-w-0">
                  <p className="font-display text-xs font-semibold text-white/80">Device Lifecycle OS</p>
                  <p className="font-display text-[10px] text-white/40">End-to-end ITAD operations platform</p>
                </div>
                <button className="liquid-glass ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/60 transition-transform hover:scale-110">
                  <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}
