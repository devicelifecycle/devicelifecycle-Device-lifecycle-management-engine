'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import {
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Package,
} from 'lucide-react'
import { getDefaultAppPathForRole } from '@/lib/auth-routing'
import { useAuth } from '@/hooks/useAuth'
import { Input } from '@/components/ui/input'

const STATS = [
  { value: '608+', label: 'Device SKUs priced' },
  { value: '6', label: 'Role-based workflows' },
  { value: '100%', label: 'Lifecycle coverage' },
]

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
        redirect && redirect.startsWith('/')
          ? redirect
          : user
          ? getDefaultAppPathForRole(user.role)
          : '/'
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
    // Force dark-mode design system for the login page
    <div className="dark">
      <div className="app-shell-bg grain-overlay relative flex min-h-screen flex-col overflow-hidden text-foreground">

        {/* Loading overlay */}
        {(isLoading || isNavigating) && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/60 backdrop-blur-sm">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="font-body text-sm text-muted-foreground">Signing in…</p>
          </div>
        )}

        {/* ── Top bar ──────────────────────────────────────────────────── */}
        <header className="topbar-surface relative z-20 flex h-14 shrink-0 items-center justify-between px-5 sm:px-8">
          <Link
            href="/"
            className="flex items-center gap-2 font-body text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to home
          </Link>

          <div className="flex items-center gap-2">
            <div className="liquid-glass-strong flex h-7 w-7 items-center justify-center rounded-lg">
              <Package className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="font-body text-sm font-semibold tracking-tight text-foreground">
              DLM Engine
            </span>
          </div>
        </header>

        {/* ── Main layout ───────────────────────────────────────────────── */}
        <div className="flex flex-1">

          {/* ── LEFT — branding panel (desktop only) ─────────────────── */}
          <div className="sidebar-surface relative hidden flex-col p-12 lg:flex lg:w-[46%] xl:w-[48%]">

            {/* Ambient warm glow behind left panel */}
            <div
              className="pointer-events-none absolute inset-0"
              aria-hidden="true"
            >
              <div
                className="absolute -left-20 top-0 h-[500px] w-[500px] rounded-full opacity-30"
                style={{ background: 'radial-gradient(circle, rgba(182,93,47,0.25) 0%, transparent 65%)' }}
              />
              <div
                className="absolute bottom-0 right-0 h-[300px] w-[300px] rounded-full opacity-20"
                style={{ background: 'radial-gradient(circle, rgba(210,140,60,0.2) 0%, transparent 65%)' }}
              />
            </div>

            {/* Content */}
            <div className="relative flex h-full flex-col">

              {/* Eyebrow label */}
              <div className="eyebrow-label w-fit">
                Enterprise ITAD Platform
              </div>

              {/* Main headline */}
              <div className="mt-auto flex flex-col gap-6 pb-4">
                <motion.div
                  initial={{ opacity: 0, y: 24 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1], delay: 0.1 }}
                >
                  <h1 className="editorial-title text-5xl text-foreground xl:text-6xl">
                    Operational<br />
                    Command<br />
                    <span className="text-primary/80">for Device</span><br />
                    Lifecycle
                  </h1>
                </motion.div>

                <motion.p
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.25 }}
                  className="font-body text-sm font-light leading-relaxed text-muted-foreground"
                >
                  End-to-end trade-in processing, AI-powered pricing, COE operations,
                  and device lifecycle tracking — all in one platform.
                </motion.p>

                {/* Stat cards */}
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.35 }}
                  className="grid grid-cols-3 gap-3"
                >
                  {STATS.map((stat) => (
                    <div
                      key={stat.label}
                      className="liquid-glass rounded-2xl px-3 py-4"
                    >
                      <p className="font-heading text-2xl font-semibold text-foreground">{stat.value}</p>
                      <p className="mt-1 font-body text-[10px] leading-tight text-muted-foreground">
                        {stat.label}
                      </p>
                    </div>
                  ))}
                </motion.div>

                {/* Divider */}
                <div className="copper-line h-px w-full opacity-50" />
                <p className="font-body text-[11px] uppercase tracking-[0.18em] text-muted-foreground/50">
                  ITAD · COE · Trade-In · Pricing
                </p>
              </div>
            </div>
          </div>

          {/* ── RIGHT — form panel ───────────────────────────────────── */}
          <div className="flex flex-1 flex-col items-center justify-center px-5 py-10 sm:px-10">

            {/* Mobile logo */}
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <div className="liquid-glass-strong flex h-10 w-10 items-center justify-center rounded-2xl">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-body text-base font-semibold text-foreground">DLM Engine</p>
                <p className="font-body text-xs text-muted-foreground">Enterprise ITAD Platform</p>
              </div>
            </div>

            {/* Form card */}
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.45, ease: [0.25, 0.1, 0.25, 1] }}
              className="surface-panel w-full max-w-sm rounded-[2rem] p-8"
            >
              {/* Card header */}
              <div className="mb-6 space-y-1.5">
                <p className="font-body text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  {mfaStep ? 'Two-Factor Auth' : 'Secure Access'}
                </p>
                <h2 className="editorial-title text-4xl text-foreground">
                  {mfaStep ? (
                    'Verify identity'
                  ) : (
                    <>Welcome back</>
                  )}
                </h2>
                <p className="font-body text-sm text-muted-foreground">
                  {mfaStep
                    ? 'Enter the 6-digit code from your authenticator app.'
                    : 'Enter your credentials to access the platform.'}
                </p>
              </div>

              {/* Shimmer bar */}
              <div className="mb-6 h-px w-full overflow-hidden rounded-full bg-white/[0.06]">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-transparent via-primary/50 to-transparent"
                  animate={{ x: ['-100%', '200%'] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', repeatDelay: 1 }}
                />
              </div>

              {/* Alerts */}
              {sessionExpired && (
                <div className="surface-muted mb-5 rounded-2xl px-4 py-3 font-body text-sm text-muted-foreground">
                  Your session expired. Please sign in again.
                </div>
              )}
              {error && (
                <div className="mb-5 rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 font-body text-sm text-destructive-foreground">
                  {error}
                </div>
              )}

              {/* MFA form */}
              {mfaStep ? (
                <form onSubmit={handleMfaSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                      <label className="font-body text-xs font-semibold text-muted-foreground">
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
                      className="text-center font-body text-xl tracking-[0.4em]"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isLoading || mfaCode.length !== 6}
                    className="flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 font-body text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
                  >
                    {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                    {isLoading ? 'Verifying…' : 'Verify Code'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setMfaStep(false); setMfaCode(''); setError('') }}
                    className="w-full font-body text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    ← Back to sign in
                  </button>
                </form>
              ) : (
                /* Login form */
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="email" className="font-body text-xs font-semibold text-muted-foreground">
                      Login ID or Email
                    </label>
                    <Input
                      id="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your login ID"
                      autoComplete="username"
                      required
                      className="font-body"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label htmlFor="password" className="font-body text-xs font-semibold text-muted-foreground">
                        Password
                      </label>
                      <Link
                        href="/forgot-password"
                        className="font-body text-xs text-muted-foreground transition-colors hover:text-foreground"
                      >
                        Forgot password?
                      </Link>
                    </div>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        autoComplete="current-password"
                        required
                        className="pr-10 font-body"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((p) => !p)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-primary py-3 font-body text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
                  >
                    {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                    {isLoading ? 'Signing in…' : 'Sign In'}
                    {!isLoading && (
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-foreground/15">
                        <ArrowRight className="h-3 w-3" />
                      </span>
                    )}
                  </button>

                  <p className="pt-2 text-center font-body text-xs text-muted-foreground">
                    Need an account?{' '}
                    <Link
                      href="/register"
                      className="text-foreground underline-offset-4 transition-colors hover:underline"
                    >
                      Request access
                    </Link>
                  </p>
                </form>
              )}
            </motion.div>

          </div>
        </div>

      </div>
    </div>
  )
}
