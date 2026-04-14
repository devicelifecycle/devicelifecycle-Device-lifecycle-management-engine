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
  Package,
  Sparkles,
} from 'lucide-react'
import { getDefaultAppPathForRole } from '@/lib/auth-routing'
import { useAuth } from '@/hooks/useAuth'
import { Input } from '@/components/ui/input'

// ── Glass style tokens (used inline so they always work on this dark page) ──
const g = {
  card: {
    background: 'rgba(255,255,255,0.07)',
    backdropFilter: 'blur(32px) saturate(140%)',
    WebkitBackdropFilter: 'blur(32px) saturate(140%)',
    border: '1px solid rgba(255,255,255,0.12)',
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.09), 0 20px 60px rgba(0,0,0,0.45)',
  } as React.CSSProperties,
  pill: {
    background: 'rgba(255,255,255,0.06)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.10)',
  } as React.CSSProperties,
  input: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.10)',
  } as React.CSSProperties,
}

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
    <div
      className="relative min-h-screen overflow-hidden font-display"
      style={{ background: 'linear-gradient(135deg, #09090f 0%, #0c0a15 40%, #0e0c10 100%)' }}
    >
      {/* ── Ambient glow orbs (CSS only, no external resources) ──────────── */}
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
      >
        {/* Top-left purple glow */}
        <div
          className="absolute -left-32 -top-32 h-[600px] w-[600px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(110,60,220,0.22) 0%, transparent 65%)' }}
        />
        {/* Bottom-right warm glow */}
        <div
          className="absolute -bottom-24 -right-16 h-[520px] w-[520px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(210,90,30,0.18) 0%, transparent 65%)' }}
        />
        {/* Center-left cool accent */}
        <div
          className="absolute left-[20%] top-[40%] h-[380px] w-[380px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(40,100,220,0.08) 0%, transparent 65%)' }}
        />
        {/* Subtle noise/grain overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\'/%3E%3C/svg%3E")',
          }}
        />
      </div>

      {/* Loading overlay */}
      {(isLoading || isNavigating) && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/60 backdrop-blur-sm">
          <Loader2 className="h-8 w-8 animate-spin text-white" />
          <p className="font-display text-sm text-white/60">Signing in…</p>
        </div>
      )}

      {/* ── Two-panel layout ──────────────────────────────────────────────── */}
      <div className="relative z-10 flex min-h-screen">

        {/* ── LEFT PANEL — branding (desktop only) ─────────────────────── */}
        <div className="relative hidden w-[52%] flex-col p-8 lg:flex">
          {/* Glass panel overlay */}
          <div
            className="pointer-events-none absolute inset-6 rounded-3xl"
            style={g.card}
          />

          {/* Content above glass */}
          <div className="relative z-10 flex h-full flex-col">

            {/* Top nav */}
            <nav className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-xl"
                  style={g.pill}
                >
                  <Package className="h-4 w-4 text-white" />
                </div>
                <span className="font-display text-lg font-semibold tracking-tight text-white">
                  DLM Engine
                </span>
              </div>
              <div
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-white/60"
                style={g.pill}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Enterprise Platform
              </div>
            </nav>

            {/* Hero — centered */}
            <div className="flex flex-1 flex-col items-start justify-center gap-8 py-16">
              {/* Eyebrow */}
              <p className="font-display text-[11px] font-medium uppercase tracking-[0.22em] text-white/40">
                Device Lifecycle Management
              </p>

              {/* Headline */}
              <h1 className="font-display text-5xl font-semibold leading-[1.05] tracking-[-0.04em] text-white lg:text-6xl">
                Operational<br />
                Command for<br />
                <span className="font-serif font-normal italic" style={{ color: 'rgba(210,160,100,0.9)' }}>
                  Device Lifecycle
                </span>
              </h1>

              {/* Feature pills */}
              <div className="flex flex-wrap gap-2">
                {FEATURE_PILLS.map((pill) => (
                  <span
                    key={pill}
                    className="rounded-full px-4 py-1.5 text-xs font-medium text-white/70"
                    style={g.pill}
                  >
                    {pill}
                  </span>
                ))}
              </div>

              {/* Stat cards */}
              <div className="flex gap-4">
                {[
                  { value: '608+', label: 'Device SKUs' },
                  { value: '6', label: 'Roles & Workflows' },
                  { value: '100%', label: 'Lifecycle Coverage' },
                ].map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-2xl px-4 py-3"
                    style={g.pill}
                  >
                    <p className="font-display text-xl font-semibold text-white">{stat.value}</p>
                    <p className="mt-0.5 font-display text-[10px] text-white/45">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom quote */}
            <div className="flex items-center gap-3 pb-2">
              <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.10)' }} />
              <p className="font-display text-[10px] uppercase tracking-widest text-white/30">
                ITAD · COE · Trade-In · Pricing
              </p>
              <div className="h-px flex-1" style={{ background: 'rgba(255,255,255,0.10)' }} />
            </div>
          </div>
        </div>

        {/* ── RIGHT PANEL — login form (always visible) ──────────────────── */}
        <div className="flex flex-1 flex-col items-center justify-center p-6 lg:p-10">

          {/* Right panel top bar (desktop) */}
          <div className="mb-8 hidden w-full max-w-sm items-center justify-between lg:flex">
            <div className="font-display text-xs text-white/30">
              Secure portal — v2.0
            </div>
            <button
              className="flex h-8 w-8 items-center justify-center rounded-full text-white/40 transition-colors hover:text-white/70"
              style={g.pill}
            >
              <Sparkles className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Mobile logo */}
          <div className="mb-10 flex items-center gap-3 lg:hidden">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-2xl"
              style={g.pill}
            >
              <Package className="h-5 w-5 text-white" />
            </div>
            <span className="font-display text-xl font-semibold tracking-tight text-white">DLM Engine</span>
          </div>

          {/* ── Form card ───────────────────────────────────────────────── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
            className="w-full max-w-sm rounded-3xl p-8"
            style={g.card}
          >
            {/* Card header */}
            <div className="mb-7 space-y-1.5">
              <p className="font-display text-[10px] font-medium uppercase tracking-[0.22em] text-white/35">
                {mfaStep ? 'Two-Factor Auth' : 'Secure Access'}
              </p>
              <h2 className="font-display text-2xl font-semibold text-white">
                {mfaStep ? (
                  'Verify your identity'
                ) : (
                  <>Welcome <span className="font-serif font-normal italic" style={{ color: 'rgba(210,160,100,0.85)' }}>back</span></>
                )}
              </h2>
              <p className="font-display text-sm text-white/45">
                {mfaStep
                  ? 'Enter the 6-digit code from your authenticator app.'
                  : 'Enter your credentials to access the platform.'}
              </p>
            </div>

            {/* Alerts */}
            {sessionExpired && (
              <div
                className="mb-5 rounded-2xl px-4 py-3 text-sm text-white/75"
                style={{ ...g.pill, borderColor: 'rgba(255,255,255,0.08)' }}
              >
                Your session expired. Please sign in again.
              </div>
            )}
            {error && (
              <div
                className="mb-5 rounded-2xl px-4 py-3 text-sm text-red-300"
                style={{
                  background: 'rgba(220,50,50,0.12)',
                  border: '1px solid rgba(220,50,50,0.20)',
                }}
              >
                {error}
              </div>
            )}

            {/* MFA form */}
            {mfaStep ? (
              <form onSubmit={handleMfaSubmit} className="space-y-5">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <KeyRound className="h-3.5 w-3.5 text-white/40" />
                    <label className="font-display text-xs font-medium text-white/55">
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
                    className="border-0 text-center font-display text-xl tracking-[0.4em] text-white placeholder:text-white/20 focus-visible:ring-1 focus-visible:ring-white/20"
                    style={g.input}
                  />
                </div>
                <button
                  type="submit"
                  disabled={isLoading || mfaCode.length !== 6}
                  className="flex w-full items-center justify-center gap-2 rounded-full py-3 font-display text-sm font-medium text-white transition-all hover:scale-[1.02] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
                  style={{
                    background: 'rgba(255,255,255,0.12)',
                    border: '1px solid rgba(255,255,255,0.18)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10)',
                  }}
                >
                  {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isLoading ? 'Verifying…' : 'Verify Code'}
                </button>
                <button
                  type="button"
                  onClick={() => { setMfaStep(false); setMfaCode(''); setError('') }}
                  className="w-full font-display text-xs text-white/35 transition-colors hover:text-white/65"
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
                    className="border-0 font-display text-white placeholder:text-white/25 focus-visible:ring-1 focus-visible:ring-white/20"
                    style={g.input}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="font-display text-xs font-medium text-white/50">Password</label>
                    <Link
                      href="/forgot-password"
                      className="font-display text-xs text-white/35 transition-colors hover:text-white/65"
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
                      className="border-0 font-display text-white placeholder:text-white/25 focus-visible:ring-1 focus-visible:ring-white/20 pr-10"
                      style={g.input}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 transition-colors hover:text-white/65"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-full py-3.5 font-display text-sm font-semibold text-white transition-all hover:scale-[1.02] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
                  style={{
                    background: 'linear-gradient(135deg, rgba(130,80,220,0.6) 0%, rgba(80,50,180,0.5) 100%)',
                    border: '1px solid rgba(160,100,255,0.35)',
                    boxShadow: '0 4px 20px rgba(100,50,200,0.3), inset 0 1px 0 rgba(255,255,255,0.12)',
                  }}
                >
                  {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {isLoading ? 'Signing in…' : 'Sign In'}
                  {!isLoading && (
                    <span
                      className="flex h-6 w-6 items-center justify-center rounded-full"
                      style={{ background: 'rgba(255,255,255,0.15)' }}
                    >
                      <ArrowRight className="h-3 w-3" />
                    </span>
                  )}
                </button>

                <p className="pt-2 text-center font-display text-xs text-white/35">
                  Need an account?{' '}
                  <Link
                    href="/register"
                    className="text-white/60 underline-offset-4 transition-colors hover:text-white hover:underline"
                  >
                    Request access
                  </Link>
                </p>
              </form>
            )}
          </motion.div>

          {/* Bottom feature cards (desktop) */}
          <div className="mt-6 hidden w-full max-w-sm lg:block">
            <div className="rounded-[2rem] p-3" style={g.pill}>
              <div className="mb-2 grid grid-cols-2 gap-2">
                {[
                  { label: 'Triage & Grading', icon: '⚙️' },
                  { label: 'Market Pricing', icon: '📈' },
                ].map((item) => (
                  <div
                    key={item.label}
                    className="rounded-2xl px-4 py-3 transition-transform hover:scale-[1.03]"
                    style={g.pill}
                  >
                    <span className="text-lg">{item.icon}</span>
                    <p className="mt-1.5 font-display text-xs font-medium text-white/65">{item.label}</p>
                  </div>
                ))}
              </div>
              <div
                className="flex items-center gap-3 rounded-2xl px-4 py-3 transition-transform hover:scale-[1.02]"
                style={g.pill}
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
                  style={{ background: 'rgba(255,255,255,0.08)' }}
                >
                  📦
                </div>
                <div className="min-w-0">
                  <p className="font-display text-xs font-semibold text-white/80">Device Lifecycle OS</p>
                  <p className="font-display text-[10px] text-white/40">End-to-end ITAD operations platform</p>
                </div>
                <button
                  className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/50 transition-transform hover:scale-110"
                  style={{ background: 'rgba(255,255,255,0.08)' }}
                >
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
