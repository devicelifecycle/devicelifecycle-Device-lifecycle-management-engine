'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useSearchParams } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, Eye, EyeOff, KeyRound, Loader2, Package, RadioTower, ShieldCheck, Sparkles, Truck } from 'lucide-react'
import { getDefaultAppPathForRole } from '@/lib/auth-routing'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'

// Lazy-load the animated background so the login form is interactive
// immediately without waiting for 18+ Framer Motion animations to init.
const OrbitingDeviceField = dynamic(
  () => import('@/components/landing/OrbitingDeviceField').then(m => ({ default: m.OrbitingDeviceField })),
  { ssr: false, loading: () => null }
)
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

const highlights = [
  'Market-led pricing intelligence',
  'COE receiving, triage, and shipping',
  'Role-aware operations for teams and partners',
]

const loginSignals = [
  { icon: ShieldCheck, label: 'Secure session lane' },
  { icon: RadioTower, label: 'Operational visibility' },
  { icon: Sparkles, label: 'Pricing signal ready' },
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
  // Tracks whether login/verifyMfa already called router.replace() — prevents double-navigation
  const loginHandledNavRef = useRef(false)
  const shouldReduceMotion = useReducedMotion()

  useEffect(() => {
    if (searchParams.get('reason') === 'session_expired') {
      setSessionExpired(true)
    }
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
        // login() / verifyMfa() already navigated — just keep the overlay up
        loginHandledNavRef.current = false
        return
      }
      // User visited /login while already authenticated — navigate them away
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

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    try {
      await login(email, password)
      // login() already called router.replace() — tell the useEffect not to double-navigate
      loginHandledNavRef.current = true
    } catch (err: unknown) {
      const e = err as { type?: string; factorId?: string } & Error
      if (e?.type === 'MFA_REQUIRED' && e.factorId) {
        setMfaFactorId(e.factorId)
        setMfaStep(true)
        return
      }
      const message = e instanceof Error ? e.message : 'Failed to sign in'
      if (message.toLowerCase().includes('invalid login credentials') || message.toLowerCase().includes('invalid email or password')) {
        setError('Invalid Login ID or password.')
        return
      }
      setError(message)
    }
  }

  async function handleMfaSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    try {
      await verifyMfa(mfaFactorId, mfaCode)
      // verifyMfa() already called router.replace() — tell the useEffect not to double-navigate
      loginHandledNavRef.current = true
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Invalid code'
      if (message.toLowerCase().includes('invalid') || message.toLowerCase().includes('expired')) {
        setError('Invalid or expired code. Please try again.')
        return
      }
      setError(message)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#120f0d] text-stone-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(209,124,67,0.16),transparent_26%),radial-gradient(circle_at_80%_18%,rgba(235,199,135,0.1),transparent_18%),linear-gradient(180deg,#120f0d_0%,#090706_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:52px_52px] opacity-30" />
      {(isLoading || isNavigating) && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-[#120f0d]/90 backdrop-blur-sm">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-stone-400">Signing in…</p>
        </div>
      )}
      <OrbitingDeviceField className="opacity-55 sm:opacity-70" compact />
      {/* Static ambient glows — no animation, GPU-cheap, desktop-only */}
      <div className="pointer-events-none absolute -left-20 top-20 hidden h-64 w-64 rounded-full bg-primary/10 blur-3xl lg:block" />
      <div className="pointer-events-none absolute right-8 top-24 hidden h-72 w-72 rounded-full bg-amber-100/8 blur-3xl lg:block" />

      <div className="relative mx-auto grid min-h-screen max-w-[1500px] items-center gap-10 px-5 py-8 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:px-10">
        <section className="relative hidden space-y-8 lg:block">
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7 }}
            className="flex items-center gap-4"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-[1.2rem] bg-primary text-primary-foreground shadow-[0_20px_45px_-24px_rgba(182,93,47,0.9)]">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <p className="editorial-title text-3xl leading-none brand-gradient">DLM Engine</p>
              <p className="text-xs uppercase tracking-[0.24em] text-stone-500">Operational access portal</p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.08 }}
            className="space-y-5"
          >
            <span className="eyebrow-label">Secure workspace</span>
            <h1 className="editorial-title max-w-3xl text-6xl text-stone-100">
              Sign in to the device operations layer.
            </h1>
            <p className="max-w-xl text-lg leading-8 text-stone-400">
              One login opens the full platform for pricing, order flow, fulfillment, and role-based visibility across the
              lifecycle.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.16 }}
            className="grid gap-3 sm:grid-cols-3"
          >
            {loginSignals.map((item, index) => (
              <motion.div
                key={item.label}
                animate={shouldReduceMotion ? undefined : { y: [0, -4, 0] }}
                transition={{ duration: 4.2, repeat: Infinity, delay: index * 0.5, ease: 'easeInOut' }}
                className="rounded-[1.35rem] border border-white/8 bg-white/[0.035] px-4 py-4"
              >
                <item.icon className="h-4 w-4 text-primary" />
                <p className="mt-3 text-sm font-medium text-stone-200">{item.label}</p>
              </motion.div>
            ))}
          </motion.div>

          <div className="grid gap-4">
            {highlights.map((item, index) => (
              <motion.div
                key={item}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + 0.1 * index }}
                whileHover={shouldReduceMotion ? undefined : { x: 8, y: -4 }}
                className="surface-panel rounded-[1.5rem] px-5 py-4"
              >
                <div className="flex items-center gap-3">
                  {index === 0 && <ShieldCheck className="h-5 w-5 text-primary" />}
                  {index === 1 && <Truck className="h-5 w-5 text-primary/80" />}
                  {index === 2 && <Package className="h-5 w-5 text-primary/60" />}
                  <p className="text-sm font-medium text-stone-200">{item}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        <section className="mx-auto w-full max-w-xl">
          <div className="mb-6 flex items-center justify-between lg:hidden">
            <Link href="/" className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[1rem] bg-primary text-primary-foreground">
                <Package className="h-4 w-4" />
              </div>
              <span className="font-semibold text-stone-100">DLM Engine</span>
            </Link>
            <Link href="/" className="text-sm text-stone-500 hover:text-stone-200">
              <ArrowLeft className="mr-1 inline h-4 w-4" />
              Back
            </Link>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.12 }}
            whileHover={shouldReduceMotion ? undefined : { y: -6, rotateY: -2, rotateX: 2 }}
            style={{ transformPerspective: 1400 }}
          >
            <Card className="surface-panel relative overflow-hidden border-white/8 bg-transparent text-stone-100">
              <motion.div
                className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-primary/80 to-transparent"
                animate={shouldReduceMotion ? undefined : { opacity: [0.25, 1, 0.25], scaleX: [0.7, 1, 0.7] }}
                transition={{ duration: 3.8, repeat: Infinity, ease: 'easeInOut' }}
              />
              <motion.div
                className="pointer-events-none absolute -right-12 top-10 h-32 w-32 rounded-full bg-primary/12 blur-3xl"
                animate={shouldReduceMotion ? undefined : { x: [0, -14, 0], y: [0, 14, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
              />
            <CardHeader className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="eyebrow-label">{mfaStep ? 'Two-Factor Auth' : 'Sign In'}</span>
                {!mfaStep && (
                  <Link href="/" className="hidden text-sm text-stone-500 hover:text-stone-200 lg:inline">
                    <ArrowLeft className="mr-1 inline h-4 w-4" />
                    Back
                  </Link>
                )}
              </div>
              <div className="space-y-2">
                <CardTitle className="text-3xl text-stone-100">
                  {mfaStep ? 'Verify your identity' : 'Welcome back'}
                </CardTitle>
                <CardDescription className="text-base text-stone-400">
                  {mfaStep
                    ? 'Enter the 6-digit code from your authenticator app to continue.'
                    : 'Use your login ID or email to enter the platform.'}
                </CardDescription>
              </div>
              {!mfaStep && (
              <div className="grid gap-2 sm:grid-cols-3">
                {['Role-aware entry', 'Pricing control', 'Operational handoff'].map((item, index) => (
                  <motion.div
                    key={item}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.28 + index * 0.08 }}
                    className="rounded-[1rem] border border-white/8 bg-white/[0.03] px-3 py-2 text-xs uppercase tracking-[0.16em] text-stone-400"
                  >
                    {item}
                  </motion.div>
                ))}
              </div>
              )}
            </CardHeader>

            <CardContent className="space-y-5">
              {sessionExpired && (
                <div className="rounded-[1.25rem] border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  Your session expired. Please sign in again.
                </div>
              )}

              {error && (
                <div className="rounded-[1.25rem] border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                  {error}
                </div>
              )}

              {mfaStep ? (
                <form onSubmit={handleMfaSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-1">
                      <KeyRound className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium text-stone-300">Authenticator Code</span>
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
                      className="text-center text-xl tracking-[0.4em]"
                    />
                    <p className="text-xs text-stone-500">Enter the 6-digit code from your authenticator app</p>
                  </div>
                  <Button type="submit" className="w-full" size="lg" disabled={isLoading || mfaCode.length !== 6}>
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {isLoading ? 'Verifying...' : 'Verify Code'}
                  </Button>
                  <button
                    type="button"
                    onClick={() => { setMfaStep(false); setMfaCode(''); setError('') }}
                    className="w-full text-center text-sm text-stone-500 hover:text-stone-200"
                  >
                    ← Back to sign in
                  </button>
                </form>
              ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium text-stone-300">Login ID or Email</label>
                  <Input
                    id="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="Enter your login ID"
                    autoComplete="username"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label htmlFor="password" className="text-sm font-medium text-stone-300">Password</label>
                    <Link href="/forgot-password" className="text-xs font-medium text-primary/80 hover:text-primary transition-colors">
                      Forgot password?
                    </Link>
                  </div>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Enter your password"
                      autoComplete="current-password"
                      required
                      className="pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-200"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button type="submit" className="w-full" size="lg" disabled={isLoading}>
                  {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {isLoading ? 'Signing in...' : 'Sign In'}
                </Button>
              </form>
              )}

              <p className="text-sm text-stone-500">
                Need an account?{' '}
                <Link href="/register" className="text-stone-200 underline-offset-4 hover:underline">
                  Request access
                </Link>
              </p>
            </CardContent>
            </Card>
          </motion.div>
        </section>
      </div>
    </div>
  )
}
