'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowRight, Building2, Check, Eye, EyeOff, Loader2, Sparkles } from 'lucide-react'
import { ByteBackMark } from '@/components/brand/ByteBackMark'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

const PLAN_LABELS: Record<string, string> = {
  essentials: 'Essentials',
  professional: 'Professional',
  enterprise: 'Enterprise',
}

function SignupInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const planParam = searchParams.get('plan') ?? 'essentials'
  const planName = PLAN_LABELS[planParam] ?? planParam

  const [company, setCompany] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: company,
          full_name: fullName,
          email,
          password,
          plan_slug: planParam,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Signup failed. Please try again.')
        return
      }
      setSuccess(true)
      setTimeout(() => router.push('/login'), 2000)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-4">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
            <Check className="h-8 w-8 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-[#0f1e3d]">You&apos;re all set!</h1>
          <p className="mt-2 text-slate-600">
            Your {planName} trial is active. Redirecting to sign in...
          </p>
          <Loader2 className="mx-auto mt-4 h-5 w-5 animate-spin text-blue-600" />
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen bg-white text-slate-700 antialiased">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[600px] overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(15,30,61,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(15,30,61,0.035)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(60%_60%_at_50%_28%,black,transparent)]" />
        <div className="absolute -top-44 left-1/2 h-[26rem] w-[46rem] max-w-[92vw] -translate-x-1/2 rounded-full bg-blue-500/[0.08] blur-[90px]" />
      </div>

      <div className="relative mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-10">
        <header className="flex items-center justify-between py-5">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#12224a] to-[#1e3a8a] text-white shadow-sm">
              <ByteBackMark className="h-4 w-4" />
            </div>
            <div className="leading-none">
              <p className="text-lg font-extrabold tracking-tight text-[#0f1e3d]">Byte-Back</p>
            </div>
          </Link>
          <div className="flex items-center gap-2">
            <Link href="/login">
              <Button variant="outline" size="sm" className="h-9">Sign In</Button>
            </Link>
            <Link href="/pricing">
              <Button variant="ghost" size="sm" className="h-9">View Plans</Button>
            </Link>
          </div>
        </header>

        <section className="mx-auto max-w-md pb-20 pt-8 sm:pt-14">
          <div className="text-center">
            <Badge variant="outline" className="mx-auto mb-5 text-blue-600 border-blue-200 bg-blue-50">
              <Sparkles className="mr-1.5 h-3 w-3" />
              14-day free trial
            </Badge>
            <h1 className="text-3xl font-bold tracking-tight text-[#0f1e3d] sm:text-4xl">
              Start your free trial
            </h1>
            <p className="mt-2 text-slate-600">
              No credit card required. Get full access to the <strong>{planName}</strong> plan.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="company" className="text-sm font-medium text-slate-700">
                Company name
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="company"
                  value={company}
                  onChange={e => setCompany(e.target.value)}
                  placeholder="Acme Wireless"
                  required
                  minLength={2}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="fullName" className="text-sm font-medium text-slate-700">
                Your name
              </label>
              <Input
                id="fullName"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Jane Smith"
                required
                minLength={2}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="email" className="text-sm font-medium text-slate-700">
                Work email
              </label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="jane@acme.ca"
                required
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-sm font-medium text-slate-700">
                Password
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="8+ characters"
                  required
                  minLength={8}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button type="submit" disabled={loading} className="w-full h-11 mt-2">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating account...
                </>
              ) : (
                <>
                  Start free trial
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>

            <p className="text-center text-xs text-slate-500 pt-2">
              By signing up, you agree to our terms of service.
              Already have an account?{' '}
              <Link href="/login" className="text-blue-600 hover:underline">Sign in</Link>
            </p>
          </form>

          <div className="mt-8 rounded-xl border border-slate-100 bg-slate-50/50 p-4 text-center">
            <p className="text-sm text-slate-600">
              Need a custom plan or enterprise features?
            </p>
            <Link href="/register" className="mt-1 inline-block text-sm font-medium text-blue-600 hover:underline">
              Contact sales
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}

export default function SignupPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    }>
      <SignupInner />
    </Suspense>
  )
}
