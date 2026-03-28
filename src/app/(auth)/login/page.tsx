'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, Eye, EyeOff, Loader2, Package, RadioTower, ShieldCheck, Sparkles, Truck } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { OrbitingDeviceField } from '@/components/landing/OrbitingDeviceField'
import { Button } from '@/components/ui/button'
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
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [sessionExpired, setSessionExpired] = useState(false)
  const { login, isLoading } = useAuth()
  const shouldReduceMotion = useReducedMotion()

  useEffect(() => {
    if (searchParams.get('reason') === 'session_expired') {
      setSessionExpired(true)
    }
  }, [searchParams])

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    try {
      await login(email, password)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to sign in'
      if (message.toLowerCase().includes('invalid login credentials') || message.toLowerCase().includes('invalid email or password')) {
        setError('Invalid Login ID or password.')
        return
      }
      setError(message)
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#120f0d] text-stone-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(209,124,67,0.16),transparent_26%),radial-gradient(circle_at_80%_18%,rgba(235,199,135,0.1),transparent_18%),linear-gradient(180deg,#120f0d_0%,#090706_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:52px_52px] opacity-30" />
      <OrbitingDeviceField className="opacity-55 sm:opacity-70" compact />
      <motion.div
        className="absolute -left-20 top-20 h-64 w-64 rounded-full bg-primary/18 blur-3xl"
        animate={shouldReduceMotion ? undefined : { x: [0, 42, -18, 0], y: [0, 34, 8, 0], opacity: [0.24, 0.4, 0.24] }}
        transition={{ duration: 14, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute right-8 top-24 h-72 w-72 rounded-full bg-amber-100/10 blur-3xl"
        animate={shouldReduceMotion ? undefined : { x: [0, -36, 18, 0], y: [0, -24, 16, 0], scale: [1, 1.08, 0.96, 1] }}
        transition={{ duration: 17, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-12 left-1/2 h-48 w-48 -translate-x-1/2 rounded-full bg-cyan-300/8 blur-3xl"
        animate={shouldReduceMotion ? undefined : { y: [0, -22, 0], opacity: [0.16, 0.28, 0.16] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
      />

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
                  {index === 0 && <ShieldCheck className="h-5 w-5 text-amber-200" />}
                  {index === 1 && <Truck className="h-5 w-5 text-teal-200" />}
                  {index === 2 && <Package className="h-5 w-5 text-sky-200" />}
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
                <span className="eyebrow-label">Sign In</span>
                <Link href="/" className="hidden text-sm text-stone-500 hover:text-stone-200 lg:inline">
                  <ArrowLeft className="mr-1 inline h-4 w-4" />
                  Back
                </Link>
              </div>
              <div className="space-y-2">
                <CardTitle className="text-3xl text-stone-100">Welcome back</CardTitle>
                <CardDescription className="text-base text-stone-400">
                  Use your login ID or email to enter the platform.
                </CardDescription>
              </div>
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
                    <Link href="/forgot-password" className="text-xs uppercase tracking-[0.16em] text-stone-500 hover:text-stone-200">
                      Forgot password
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
